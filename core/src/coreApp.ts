import fs from "fs";
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

class Application {
	private server: WebSocketServer;
	private clients: Client[] = [];

	public awaitingIpResolutions: { waitingFor: string; client: Client }[] = [];

	constructor(private port: number, public serviceAuthKey: string) {}

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
		this.tick();
	}

	public simulateTimeoutAll() {
		this.clients.forEach(client => (client.lastPongReceivedAt = 0));
	}

	private handleConnection(conn: WebSocket) {
		const client = new Client(conn, this);
		console.log(`New connection: ${client.id}`);
		this.clients.push(client);
	}

	public getClientForService(serviceIdentifier: string): Client {
		const client = this.clients.find(c => c.isAuthenticated && c.registeredServices.includes(serviceIdentifier));
		return client;
	}

	public tick() {
		this.clients.forEach(client => client.update());
		this.clients = this.clients.filter(client => client.isAlive);

		setTimeout(() => this.tick(), NETWORK_TICK_RATE);
	}
}

export { Application };
