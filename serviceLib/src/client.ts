import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";

import { AuthPacket, Packet, PacketBuilder, PongPacket, SubscribeToEventPacket } from "./packets.js";
import { ServiceConnector } from "./serviceConnector.js";

const PING_RATE = 1000;
const TIMEOUT = 15000;

class Client {
	public isAlive = true;
	private lastPingSentAt = Date.now();
	private lastPongReceivedAt = Date.now();
	private waitingForPong = false;

	public connectedAt = Date.now();
	public lastLatency = 0;

	public id: string;
	public isAuthenticated = false;

	public subscribedEvents: { serviceIdentifier: string; event: string }[] = [];

	constructor(private socket: WebSocket, private serviceConnector: ServiceConnector) {
		this.id = uuidv4();
		socket.onmessage = event => this.handleMessage(event.data.toString());
		socket.onclose = () => this.handleClose();
		socket.onerror = err => console.error(`Client socket error: ${err}`);
	}

	public update() {
		const now = Date.now();

		if (now - this.lastPongReceivedAt > TIMEOUT) {
			console.log(`${this} timed out`);
			this.close();
			return;
		}

		if (now - this.lastPingSentAt > PING_RATE && !this.waitingForPong) {
			this.sendPing();
		}
	}

	private sendPing() {
		this.lastPingSentAt = Date.now();
		this.waitingForPong = true;
		this.send(PacketBuilder.ping());
	}

	public send(packet: Packet) {
		if (!this.isAlive) return;
		const json = JSON.stringify(packet);
		this.socket.send(json);
	}

	private handleMessage(message: string) {
		try {
			// console.log(`${this}: ${message.length}`);
			const packet: Packet | Packet[] = JSON.parse(message);
			if (Array.isArray(packet)) packet.forEach(p => this.handlePacket(p, message));
			else this.handlePacket(packet, message);
		} catch (err) {
			console.error(`Error parsing client message: `);
			console.error(err);
			console.error(`Message: ${message}`);
			return;
		}
	}

	private handlePacket(packet: Packet, message: string) {
		if (!PacketBuilder.isPong(packet) && !PacketBuilder.isAuth(packet) && !this.isAuthenticated) {
			console.warn(`Client ${this} sent packet before authentication: ${message}`);
			return;
		}

		if (PacketBuilder.isPong(packet)) this.handlePongPacket(packet);
		else if (PacketBuilder.isAuth(packet)) this.handleAuth(packet);
		else if (PacketBuilder.isServiceCall(packet)) this.serviceConnector.handleServiceCall(packet, this);
		else if (PacketBuilder.isSubscribeToEvent(packet)) this.handleSubscribeEvent(packet);
		else if (PacketBuilder.isReadStreamStart(packet)) this.serviceConnector.handleReadStreamStart(packet, this);
		else if (PacketBuilder.isWriteStreamStart(packet)) this.serviceConnector.handleWriteStreamStart(packet, this);
		else if (PacketBuilder.isStreamData(packet)) this.serviceConnector.handleStreamData(packet, this);
		else console.warn(`Client ${this} sent unknown packet: ${message}`);
	}

	private handlePongPacket(packet: PongPacket) {
		this.lastPongReceivedAt = Date.now();
		this.waitingForPong = false;
		this.lastLatency = this.lastPongReceivedAt - this.lastPingSentAt;
	}

	private handleSubscribeEvent(packet: SubscribeToEventPacket) {
		const hasExistingSub = this.subscribedEvents.find(e => e.serviceIdentifier === packet.serviceIdentifier && e.event === packet.eventName);
		if (hasExistingSub) return;
		console.log(`Client ${this} subscribed to ${packet.serviceIdentifier}.${packet.eventName}`);
		this.subscribedEvents.push({ serviceIdentifier: packet.serviceIdentifier, event: packet.eventName });
	}

	public isSubbedToEvent(serviceIdentifier: string, event: string) {
		return this.subscribedEvents.some(e => e.serviceIdentifier === serviceIdentifier && e.event === event);
	}

	private handleAuth(packet: AuthPacket) {
		// Check auth
		if (packet.authenticationKey != this.serviceConnector.authKey) {
			console.warn(`${this} tried to identify with invalid auth key (${packet.authenticationKey})`);
			return;
		}
		this.isAuthenticated = true;
		console.log(`${this} authenticated`);
	}

	public close() {
		this.socket.close();
		this.isAlive = false;

		console.log(`${this} closed`);
	}

	private handleClose() {
		this.isAlive = false;
	}

	public toString() {
		let str = ``;
		if (!this.isAlive) str += `[DEAD] `;
		if (this.isAuthenticated) return `${str}${this.id.split("-").at(-1)}`;
		return `${str}[NA] ${this.id.split("-").at(-1)}`;
	}
}

export { Client };
