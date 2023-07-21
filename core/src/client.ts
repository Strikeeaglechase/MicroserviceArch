import {
	AuthPacket, FireEventPacket, Packet, PacketBuilder, RegisterServicePacket,
	SubscribeToEventPacket
} from "serviceLib/packets.js";
import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";

import { Application } from "./coreApp.js";

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
	public registeredServices: string[] = [];
	public isAuthenticated = false;

	public subscribedEvents: { serviceIdentifier: string, event: string; }[] = [];

	constructor(private socket: WebSocket, private app: Application) {
		this.id = uuidv4();
		socket.onmessage = (event) => this.handleMessage(event.data.toString());
		socket.onclose = () => this.handleClose();
		socket.onerror = (err) => console.error(`Client socket error: ${err}`);
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
		const json = JSON.stringify(packet);
		this.socket.send(json);
	}

	private handleMessage(message: string) {
		try {
			const packet: Packet = JSON.parse(message);
			if (PacketBuilder.isPong(packet)) {
				this.lastPongReceivedAt = Date.now();
				this.waitingForPong = false;
				this.lastLatency = this.lastPongReceivedAt - this.lastPingSentAt;
			}

			if (PacketBuilder.isAuth(packet)) this.handleAuth(packet);
			if (PacketBuilder.isRegisterService(packet)) this.handleRegisterService(packet);
			if (PacketBuilder.isServiceCall(packet)) this.app.handleServiceCall(packet, this);
			if (PacketBuilder.isServiceCallResponse(packet)) this.app.handleServiceReply(packet);
			if (PacketBuilder.isSubscribeToEvent(packet)) this.handleSubscribeEvent(packet);
			if (PacketBuilder.isFireEvent(packet)) this.handleFireEvent(packet);
		} catch (err) {
			console.error(`Error parsing client message: `);
			console.error(err);
			console.error(`Message: ${message}`);
			return;
		}
	}

	private handleSubscribeEvent(packet: SubscribeToEventPacket) {
		console.log(`Client ${this} subscribed to ${packet.serviceIdentifier}.${packet.eventName}`);
		this.subscribedEvents.push({ serviceIdentifier: packet.serviceIdentifier, event: packet.eventName });
	}

	private handleFireEvent(packet: FireEventPacket) {
		this.app.emitEventToSubscribedClients(packet);
	}

	private handleAuth(packet: AuthPacket) {
		// Check auth
		if (packet.authenticationKey != this.app.serviceAuthKey) {
			console.warn(`${this} tried to identify with invalid auth key (${packet.authenticationKey})`);
			return;
		}
		this.isAuthenticated = true;
		console.log(`${this} authenticated`);
	}

	private handleRegisterService(packet: RegisterServicePacket) {
		console.log(`${this} registered service ${packet.serviceIdentifier}`);
		this.registeredServices.push(packet.serviceIdentifier);
		// Find pending calls
		const pending = this.app.serviceCallStore[packet.serviceIdentifier];
		if (!pending || pending.length == 0) return;
		console.log(`Found ${pending.length} pending calls for ${packet.serviceIdentifier}`);

		// Send pending calls
		pending.forEach((call) => this.send(call));
		delete this.app.serviceCallStore[packet.serviceIdentifier];

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
		if (this.registeredServices.length > 0) return `${str}(${this.registeredServices.join(",")}) (${this.id.split("-").at(-1)})`;
		if (this.isAuthenticated) return `${str}${this.id.split("-").at(-1)}`;
		return `${str}[NA] ${this.id.split("-").at(-1)}`;
	}
}

export { Client };