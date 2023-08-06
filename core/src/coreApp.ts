import fs from "fs";
import { WebSocket, WebSocketServer } from "ws";

import {
	FireEventPacket, Packet, ServiceCallPacket, ServiceCallResponsePacket
} from "../../serviceLib/src/packets.js";
import { Client } from "./client.js";

const NETWORK_TICK_RATE = 1000 / 60; // 60 times per second

class Application {
	private server: WebSocketServer;
	private clients: Client[] = [];
	private masterLog: fs.WriteStream;

	public serviceCallStore: Record<string, Packet[]> = {};
	private serviceCallReplyMap: Record<string, Client> = {};

	constructor(private port: number, public serviceAuthKey: string) {
		this.masterLog = fs.createWriteStream("../master.log", { flags: "a" });
		this.logText(`Startup`);
	}

	public init() {
		console.log(`Startup CoreApp on port ${this.port}`);

		this.server = new WebSocketServer({ port: this.port });

		this.server.on("connection", (conn) => this.handleConnection(conn));
		this.server.on("error", (err) => {
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

	public handleServiceCall(call: ServiceCallPacket, client: Client) {
		const serviceClient = this.getClientForService(call.serviceIdentifier);
		this.serviceCallReplyMap[call.pid] = client;
		this.logServiceCall(client, call);

		if (!serviceClient) {
			if (!this.serviceCallStore[call.serviceIdentifier]) this.serviceCallStore[call.serviceIdentifier] = [];
			this.serviceCallStore[call.serviceIdentifier].push(call);
		} else {
			serviceClient.send(call);
		}
	}

	public handleServiceReply(reply: ServiceCallResponsePacket) {
		const client = this.serviceCallReplyMap[reply.orgPid];
		if (!client) {
			console.warn(`No client is waiting for reply ${reply.orgPid}`);
			return;
		}
		this.logServiceReply(reply);

		client.send(reply);
		delete this.serviceCallReplyMap[reply.orgPid];
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
		this.clients.forEach((client) => client.update());
		this.clients = this.clients.filter((client) => client.isAlive);

		setTimeout(() => this.tick(), NETWORK_TICK_RATE);
	}

	private logServiceCall(callingClient: Client, call: ServiceCallPacket) {
		const clientServices = "(" + callingClient.registeredServices.join(", ") + ")";
		this.logText(`service_call ${call.pid} ${callingClient.id} ${clientServices} -> ${call.serviceIdentifier}.${call.methodName}  Args: ${JSON.stringify(call.arguments)}`);
	}

	private logServiceReply(reply: ServiceCallResponsePacket) {
		this.logText(`service_reply ${reply.orgPid}  Reply: ${JSON.stringify(reply.returnValue)}`);
	}

	private logEvent(event: FireEventPacket) {
		this.logText(`event ${event.pid} ${event.serviceIdentifier}.${event.eventName}  Args: ${JSON.stringify(event.arguments)}`);
	}

	private logEventSentToClient(event: FireEventPacket, client: Client) {
		const clientServices = "(" + client.registeredServices.join(", ") + ")";
		this.logText(`event_sent ${event.pid} -> ${client.id}  ${event.serviceIdentifier}.${event.eventName} -> ${clientServices}`);
	}

	public logText(text: string) {
		this.masterLog.write(`[${new Date().toISOString()}] ${text}\n`);
	}
}

export { Application };