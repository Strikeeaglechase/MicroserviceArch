import fs from "fs";
import { FireEventPacket, Packet, PacketBuilder, ServiceSpecificMethodCallBase, ServiceSpecificMethodCallReplyBase } from "serviceLib/packets.js";
import { WebSocket, WebSocketServer } from "ws";

import { Client } from "./client.js";

const NETWORK_TICK_RATE = 1000 / 60; // 60 times per second
const MAX_LOG_LINE_LENGTH = 1024 * 2;
interface LogIgnore {
	serviceIdentifier: string;
	methodName: string;
}
const logIgnoreConfig = JSON.parse(process.env.LOG_IGNORE || "[]") as LogIgnore[];
const logIgnore: Set<string> = new Set();
logIgnoreConfig.forEach(i => logIgnore.add(`${i.serviceIdentifier}.${i.methodName}`));

interface ServiceCallMetrics {
	className: string;
	methodName: string;
	count: number;
	totalPing: number;
	data: number;
}

class Application {
	private server: WebSocketServer;
	private clients: Client[] = [];
	private masterLog: fs.WriteStream;

	public serviceCallStore: Record<string, Packet[]> = {};
	private serviceCallReplyMap: Record<string, { client: Client; rpcIdentifier: string; startAt: number }> = {};

	private serviceCallCounts: Record<string, ServiceCallMetrics> = {};
	private lastMetadataEmit: number = 0;

	private reduceFileLogging = false;

	constructor(private port: number, public serviceAuthKey: string) {
		this.masterLog = fs.createWriteStream("../master.log", { flags: "a" });
		this.logText(`Startup`);
		this.logText(`Configured to ignore logs: ${[...logIgnore].join(", ")}`);
		if (process.env.REDUCE_FILE_LOGGING == "true") this.reduceFileLogging = true;
		if (this.reduceFileLogging) {
			this.logText(`File logging reduced, only major events will log`);
		}
	}

	public init() {
		console.log(`Startup CoreApp on port ${this.port}`);

		this.server = new WebSocketServer({ port: this.port });

		this.server.on("connection", conn => this.handleConnection(conn));
		this.server.on("error", err => {
			console.error(`Error on CoreApp websocket server: `);
			console.error(err);
		});
		this.server.on("close", () => console.log("CoreApp websocket server closed"));
		this.server.on("listening", () => console.log("CoreApp websocket server started"));
		this.logText(`Ready`);
		this.tick();
	}

	private handleConnection(conn: WebSocket) {
		const client = new Client(conn, this);
		console.log(`New connection: ${client.id}`);
		this.logText(`connection ${client.id}`);
		this.clients.push(client);
	}

	public handleServiceMessage(call: ServiceSpecificMethodCallBase, client: Client) {
		const serviceClient = this.getClientForService(call.serviceIdentifier);
		this.serviceCallReplyMap[call.pid] = { client: client, rpcIdentifier: `${call.serviceIdentifier}.${call.methodName}`, startAt: Date.now() };

		// Ok this code is goofy. Write stream "replies" are really client->service calls, so we update the service
		if (PacketBuilder.isWriteStreamStart(call)) this.serviceCallReplyMap[call.pid].client = serviceClient;
		this.logServiceCall(client, call);
		this.trackServiceCall(call);

		if (!serviceClient) {
			if (!this.serviceCallStore[call.serviceIdentifier]) this.serviceCallStore[call.serviceIdentifier] = [];
			this.serviceCallStore[call.serviceIdentifier].push(call);
		} else {
			serviceClient.send(call);
		}
	}

	public handleServiceReply(reply: ServiceSpecificMethodCallReplyBase) {
		const replyTarget = this.serviceCallReplyMap[reply.orgPid];
		if (replyTarget === undefined) {
			console.warn(`No client is waiting for reply ${reply.orgPid}`);
			return;
		}

		if (replyTarget === null) return; // Internal call without reply handler

		this.logServiceReply(reply);
		this.trackReplyData(reply);

		replyTarget.client.send(reply);

		// Not all packets should remove the reply. Streams should only remove if its end
		if (PacketBuilder.isServiceCallResponse(reply)) {
			this.trackServiceCallReply(reply);
			delete this.serviceCallReplyMap[reply.orgPid];
		}
		if (PacketBuilder.isStreamData(reply) && reply.event == "end") {
			this.trackServiceCallReply(reply);
			delete this.serviceCallReplyMap[reply.orgPid];
		}
	}

	public emitEventToSubscribedClients(event: FireEventPacket) {
		this.logEvent(event);
		this.clients.forEach(client => {
			if (client.subscribedEvents.some(e => e.serviceIdentifier == event.serviceIdentifier && e.event == event.eventName)) {
				client.send(event);
				this.logEventSentToClient(event, client);
			}
		});
	}

	private getClientForService(serviceIdentifier: string): Client {
		const client = this.clients.find(c => c.isAuthenticated && c.registeredServices.includes(serviceIdentifier));
		return client;
	}

	public tick() {
		this.clients.forEach(client => client.update());
		this.clients = this.clients.filter(client => client.isAlive);

		const now = Date.now();
		// 30 minutes
		if (now - this.lastMetadataEmit > 1000 * 60) {
			// Locate DBService
			const dbService = this.getClientForService("DBService");
			if (!dbService) console.warn("Unable to find DBservice to log tracking data");
			else {
				const packet = PacketBuilder.serviceCall("DBService", "logServiceCallMetrics", [this.serviceCallCounts]);
				dbService.send(packet);
				this.serviceCallReplyMap[packet.pid] = null; // Discard reply
			}

			this.lastMetadataEmit = now;
			this.serviceCallCounts = {};
		}

		setTimeout(() => this.tick(), NETWORK_TICK_RATE);
	}

	private trackServiceCall(call: ServiceSpecificMethodCallBase) {
		const key = `${call.serviceIdentifier}.${call.methodName}`;
		if (!this.serviceCallCounts[key]) {
			this.serviceCallCounts[key] = {
				className: call.serviceIdentifier,
				methodName: call.methodName,
				count: 0,
				totalPing: 0,
				data: 0
			};
		}
	}

	private trackServiceCallReply(reply: ServiceSpecificMethodCallReplyBase) {
		const replyTarget = this.serviceCallReplyMap[reply.orgPid];
		const key = replyTarget.rpcIdentifier;
		this.serviceCallCounts[key].totalPing += Date.now() - replyTarget.startAt;
		this.serviceCallCounts[key].count++;
	}

	private trackReplyData(reply: ServiceSpecificMethodCallReplyBase) {
		const replyTarget = this.serviceCallReplyMap[reply.orgPid];
		const key = replyTarget.rpcIdentifier;

		if (PacketBuilder.isServiceCallResponse(reply)) {
			this.serviceCallCounts[key].data += JSON.stringify(reply.returnValue)?.length ?? 0;
		} else if (PacketBuilder.isStreamData(reply)) {
			this.serviceCallCounts[key].data += JSON.stringify(reply.data)?.length ?? 0;
		}
	}

	private logServiceCall(callingClient: Client, call: ServiceSpecificMethodCallBase) {
		if (this.reduceFileLogging) return;
		if (logIgnore.has(`${call.serviceIdentifier}.${call.methodName}`)) return;

		const clientServices = "(" + callingClient.registeredServices.join(", ") + ")";
		this.logText(
			`service_call (${call.type}) ${call.pid} ${callingClient.id} ${clientServices} -> ${call.serviceIdentifier}.${call.methodName}  Args: ${JSON.stringify(
				call.arguments
			)}`
		);
	}

	private logServiceReply(reply: ServiceSpecificMethodCallReplyBase) {
		if (this.reduceFileLogging) return;
		if ("returnValue" in reply) this.logText(`service_reply ${reply.orgPid} (${reply.type})  Reply: ${JSON.stringify(reply.returnValue)}`);
		else this.logText(`service_reply ${reply.orgPid} (${reply.type})`);
	}

	private logEvent(event: FireEventPacket) {
		if (this.reduceFileLogging) return;
		if (logIgnore.has(`${event.serviceIdentifier}.${event.eventName}`)) return;

		this.logText(`event ${event.pid} ${event.serviceIdentifier}.${event.eventName}  Args: ${JSON.stringify(event.arguments)}`);
	}

	private logEventSentToClient(event: FireEventPacket, client: Client) {
		if (this.reduceFileLogging) return;
		if (logIgnore.has(`${event.serviceIdentifier}.${event.eventName}`)) return;

		const clientServices = "(" + client.registeredServices.join(", ") + ")";
		this.logText(`event_sent ${event.pid} -> ${client.id}  ${event.serviceIdentifier}.${event.eventName} -> ${clientServices}`);
	}

	public logText(text: string) {
		if (text.length > MAX_LOG_LINE_LENGTH) {
			text = text.substring(0, MAX_LOG_LINE_LENGTH) + `... (${text.length - MAX_LOG_LINE_LENGTH} more chars)`;
		}

		this.masterLog.write(`[${new Date().toISOString()}] ${text}\n`);
	}
}

export { Application };
