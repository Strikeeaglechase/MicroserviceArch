import { AuthPacket, Packet, PacketBuilder, PongPacket, RegisterServicePacket, ServiceIPLookupPacket } from "serviceLib/packets.js";
import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";

import { Application } from "./coreApp.js";

const PING_RATE = 1000;
const TIMEOUT = 15000;

class Client {
	public isAlive = true;
	private lastPingSentAt = Date.now();
	public lastPongReceivedAt = Date.now();
	private waitingForPong = false;

	public connectedAt = Date.now();
	public lastLatency = 0;

	public id: string;
	public registeredServices: string[] = [];
	public isAuthenticated = false;

	private remoteIp: string;
	private remotePort: number;

	constructor(private socket: WebSocket, private app: Application) {
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
		const json = JSON.stringify(packet);
		this.socket.send(json);
	}

	private handleMessage(message: string) {
		try {
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
		else if (PacketBuilder.isRegisterService(packet)) this.handleRegisterService(packet);
		else if (PacketBuilder.isServiceIPLookup(packet)) this.handleServiceIPLookup(packet);
		else console.warn(`Client ${this} sent unknown packet: ${message}`);
	}

	private handlePongPacket(packet: PongPacket) {
		this.lastPongReceivedAt = Date.now();
		this.waitingForPong = false;
		this.lastLatency = this.lastPongReceivedAt - this.lastPingSentAt;
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

		this.remoteIp = packet.ip;
		this.remotePort = packet.port;

		// Find any clients waiting for this service
		const awaitingResolutions = this.app.awaitingIpResolutions.filter(r => r.waitingFor === packet.serviceIdentifier);
		const resolution = PacketBuilder.serviceIPResolution(packet.serviceIdentifier, this.remoteIp, this.remotePort);

		awaitingResolutions.forEach(r => {
			r.client.send(resolution);
		});

		this.app.awaitingIpResolutions = this.app.awaitingIpResolutions.filter(r => r.waitingFor !== packet.serviceIdentifier);
	}

	private handleServiceIPLookup(packet: ServiceIPLookupPacket) {
		const existingService = this.app.getClientForService(packet.serviceIdentifier);
		if (existingService) {
			const resolution = PacketBuilder.serviceIPResolution(packet.serviceIdentifier, existingService.remoteIp, existingService.remotePort);
			console.log(`Resolved IP for ${packet.serviceIdentifier} to ${existingService.remoteIp}:${existingService.remotePort}`);
			this.send(resolution);
		} else {
			this.app.awaitingIpResolutions.push({ waitingFor: packet.serviceIdentifier, client: this });
		}
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
