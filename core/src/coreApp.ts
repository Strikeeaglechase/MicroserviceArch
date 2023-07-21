import { WebSocket, WebSocketServer } from "ws";

import {
	FireEventPacket, Packet, ServiceCallPacket, ServiceCallResponsePacket
} from "../../serviceLib/src/packets.js";
import { Client } from "./client.js";

const NETWORK_TICK_RATE = 1000 / 10; // 10 times per second

class Application {
	private server: WebSocketServer;
	private clients: Client[] = [];

	public serviceCallStore: Record<string, Packet[]> = {};
	private serviceCallReplyMap: Record<string, Client> = {};

	constructor(private port: number, public serviceAuthKey: string) { }

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

		this.tick();
	}

	private handleConnection(conn: WebSocket) {
		const client = new Client(conn, this);
		console.log(`New connection: ${client.id}`);
		this.clients.push(client);
	}

	public handleServiceCall(call: ServiceCallPacket, client: Client) {
		const serviceClient = this.getClientForService(call.serviceIdentifier);
		this.serviceCallReplyMap[call.pid] = client;

		if (!serviceClient) {
			console.warn(`No client is currently providing ${call.serviceIdentifier}`);

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

		client.send(reply);
		delete this.serviceCallReplyMap[reply.orgPid];
	}

	public emitEventToSubscribedClients(event: FireEventPacket) {
		this.clients.forEach(client => {
			if (client.subscribedEvents.some(e => e.serviceIdentifier == event.serviceIdentifier && e.event == event.eventName))
				client.send(event);
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
}

export { Application };