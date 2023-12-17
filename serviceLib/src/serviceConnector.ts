import { Readable, Stream, Writable } from "stream";
import { WebSocket, WebSocketServer } from "ws";

import { Client } from "./client.js";
import {
	FireEventPacket,
	Packet,
	PacketBuilder,
	ReadStreamStartPacket,
	ServiceCallPacket,
	ServiceCallResponsePacket,
	ServiceIPResolutionPacket,
	StreamDataPacket,
	WriteStreamStartPacket
} from "./packets.js";

const PORT_START = 9000;
const PORT_LEN = 999;
const CORE = "CORE";
const NETWORK_TICK_RATE = 1000 / 60; // 60 times per second

const proto = "ws://";

interface ServiceConnection {
	socket: WebSocket;
	identifier: string;
	queue: Packet[];
}

class ServiceConnector {
	private coreSocket: WebSocket;
	private server: WebSocketServer;
	private serverIsOpen = false;

	private clients: Client[] = [];
	private serviceConnections: ServiceConnection[] = [];

	public connectedToCore = false;

	private registeredServices: Record<string, object> = {};
	private replyHandlers: Record<string, (res: any) => void> = {};
	private eventHandlers: Record<`${string}.${string}`, ((...args: any[]) => void)[]> = {};
	private readStreamHandlers: Record<string, { stream: Readable; queue: Buffer[]; readyForNextData: boolean }> = {};

	public static instance: ServiceConnector;

	constructor(private coreUrl: string, public authKey: string, private externalIp = "127.0.0.1", private serverPort = -1) {
		ServiceConnector.instance = this;
		this.tick();
	}

	public execServiceCall(serviceIdentifier: string, method: string, args: any[]) {
		const packet = PacketBuilder.serviceCall(serviceIdentifier, method, args);
		this.send(packet, serviceIdentifier);
		return new Promise<any>(res => {
			this.replyHandlers[packet.pid] = res;
		});
	}

	public execReadStreamCall(serviceIdentifier: string, method: string, args: any[]) {
		const packet = PacketBuilder.readStreamStart(serviceIdentifier, method, args);
		this.send(packet, serviceIdentifier);

		const handler = { queue: [], readyForNextData: false, stream: null };
		const stream = new Stream.Readable({
			read: async () => {
				if (!handler) {
					console.error(`Service Handler received stream data for unregistered stream ${packet.pid}`);
					return;
				}

				const data = handler.queue.shift();
				if (data !== undefined) stream.push(data);
				else handler.readyForNextData = true;
			}
		});

		handler.stream = stream;
		this.readStreamHandlers[packet.pid] = handler;
		return stream;
	}

	public execWriteStreamCall(serviceIdentifier: string, method: string, args: any[]) {
		const packet = PacketBuilder.writeStreamStart(serviceIdentifier, method, args);
		this.send(packet, serviceIdentifier);

		const stream = new Stream.Writable({
			write: (chunk, encoding, callback) => {
				const streamPacket = PacketBuilder.streamDataPacket(packet.pid, chunk, "data");
				this.send(streamPacket, serviceIdentifier);
				callback();
			}
		});

		stream.on("close", () => {
			const streamPacket = PacketBuilder.streamDataPacket(packet.pid, null, "end");
			this.send(streamPacket, serviceIdentifier);
		});

		return stream;
	}

	public execEventCall(serviceIdentifier: string, method: string, args: any[]) {
		const subscribedClients = this.clients.filter(c => c.isSubbedToEvent(serviceIdentifier, method));
		const packet = PacketBuilder.fireEvent(serviceIdentifier, method, args);
		subscribedClients.forEach(c => c.send(packet));
	}

	public registerEventHandler(serviceIdentifier: string, event: string, handler: (...args: any[]) => void) {
		const eventName = `${serviceIdentifier}.${event}`;
		if (!this.eventHandlers[eventName]) {
			this.eventHandlers[eventName] = [];
			this.send(PacketBuilder.subscribeToEvent(serviceIdentifier, event), serviceIdentifier);
		}
		this.eventHandlers[eventName].push(handler);
	}

	public async handleServiceCall(packet: ServiceCallPacket, conn: Client) {
		const service = this.registeredServices[packet.serviceIdentifier];
		if (!service) {
			console.error(`Service Handler received service call for unregistered service ${packet.serviceIdentifier}`);
			return;
		}

		const method = service[packet.methodName];
		if (!method) {
			console.error(`Service Handler received service call for unregistered method ${packet.methodName} of service ${packet.serviceIdentifier}`);
			return;
		}
		const result = await service[packet.methodName].apply(service, packet.arguments);
		conn.send(PacketBuilder.serviceCallResponse(packet.pid, result));
	}

	public connect() {
		return new Promise<void>(res => {
			this.coreSocket = new WebSocket(this.coreUrl);
			this.coreSocket.onopen = () => {
				this.handleOpen();
				res();
			};
			this.coreSocket.onmessage = event => this.handleCoreMessage(event.data.toString());
			this.coreSocket.onerror = err => console.error(`Service Handler CORE socket error: ${err.message}`);
			this.coreSocket.onclose = () => {
				console.log(`Service Handler socket closed`);
				this.connectedToCore = false;
				setTimeout(() => this.connect().then(res), 250);
			};

			this.setupServer();
		});
	}

	private tick() {
		this.clients.forEach(client => client.update());
		this.clients = this.clients.filter(client => client.isAlive);

		setTimeout(() => this.tick(), NETWORK_TICK_RATE);
	}

	private setupServer() {
		if (this.server && this.serverIsOpen) return;

		if (this.serverPort == -1) {
			this.serverPort = Math.floor(Math.random() * PORT_LEN) + PORT_START;
			console.log(`No port specified, using ${this.serverPort}`);
		}

		try {
			this.server = new WebSocketServer({ port: this.serverPort });

			this.server.on("connection", socket => {
				const client = new Client(socket, this);
				this.clients.push(client);
			});

			this.server.on("error", err => {
				console.log(`Service Handler server error: ${err.message}`);
				if (err.message.includes("EADDRINUSE")) {
					this.serverPort = -1;
					this.server.close();
				}

				this.serverIsOpen = false;
			});

			this.server.on("close", () => {
				console.log(`Service Handler server closed`);
				this.serverPort = -1;
				this.serverIsOpen = false;
				this.setupServer();
			});

			this.server.on("listening", () => {
				console.log(`Service Handler server listening on port ${this.serverPort}`);
				this.serverIsOpen = true;
			});
		} catch (err) {
			console.log(`Service Handler server setup error: ${err.message}`);
			this.serverPort = -1;
			this.setupServer();
		}
	}

	private handleOpen() {
		console.log(`Service Handler connected to ${this.coreUrl}`);
		this.connectedToCore = true;

		this.send(PacketBuilder.auth(this.authKey), CORE);

		Object.keys(this.registeredServices).forEach(serviceIdentifier => {
			this.send(PacketBuilder.registerService(serviceIdentifier, this.externalIp, this.serverPort), CORE);
			console.log(`Service Handler registered service ${serviceIdentifier}`);
		});

		Object.keys(this.eventHandlers).forEach(event => {
			const [serviceIdentifier, eventName] = event.split(".");
			this.send(PacketBuilder.subscribeToEvent(serviceIdentifier, eventName), serviceIdentifier);
			console.log(`Service Handler subscribed to event ${serviceIdentifier}.${event}`);
		});
	}

	private handleReply(packet: ServiceCallResponsePacket) {
		const handler = this.replyHandlers[packet.orgPid];
		if (!handler) {
			console.error(`Service Handler received reply for unhandled packet ${packet.orgPid}`);
			return;
		}

		handler(packet.returnValue);
		delete this.replyHandlers[packet.orgPid];
	}

	private handleFiredEvent(packet: FireEventPacket) {
		const handlers = this.eventHandlers[`${packet.serviceIdentifier}.${packet.eventName}`];
		if (!handlers) return;

		handlers.forEach(handler => handler.apply(null, packet.arguments));
	}

	public async handleReadStreamStart(packet: ReadStreamStartPacket, conn: Client) {
		const service = this.registeredServices[packet.serviceIdentifier];
		if (!service) {
			console.error(`Service Handler received service call for unregistered service ${packet.serviceIdentifier}`);
			return;
		}

		const method = service[packet.methodName];
		if (!method) {
			console.error(`Service Handler received service call for unregistered method ${packet.methodName} of service ${packet.serviceIdentifier}`);
			return;
		}

		const writeStream = new Stream.Writable({
			write: (chunk, encoding, callback) => {
				const streamPacket = PacketBuilder.streamDataPacket(packet.pid, chunk, "data");
				conn.send(streamPacket);
				callback();
			}
		});

		writeStream.on("close", () => {
			const streamPacket = PacketBuilder.streamDataPacket(packet.pid, null, "end");
			conn.send(streamPacket);
		});

		const args = [writeStream, ...packet.arguments];
		await service[packet.methodName].apply(service, args);
	}

	public handleStreamData(packet: StreamDataPacket, conn: Client) {
		const stream = this.readStreamHandlers[packet.orgPid];
		if (!stream) {
			console.error(`Service Handler received stream data for unregistered stream ${packet.orgPid}`);
			return;
		}

		if (packet.event == "data") {
			if (packet.data == null) {
				console.log(`Null data for non-end packet`);
				console.log(packet);
			}

			if (stream.readyForNextData) {
				stream.readyForNextData = false;
				stream.stream.push(Buffer.from(packet.data));
			} else {
				stream.queue.push(Buffer.from(packet.data));
			}
		} else if (packet.event == "end") {
			if (stream.readyForNextData) {
				stream.stream.push(null);
				delete this.readStreamHandlers[packet.orgPid];
			} else stream.queue.push(null);
		}
	}

	public async handleWriteStreamStart(packet: WriteStreamStartPacket, conn: Client) {
		const service = this.registeredServices[packet.serviceIdentifier];
		if (!service) {
			console.error(`Service Handler received service call for unregistered service ${packet.serviceIdentifier}`);
			return;
		}

		const method = service[packet.methodName];
		if (!method) {
			console.error(`Service Handler received service call for unregistered method ${packet.methodName} of service ${packet.serviceIdentifier}`);
			return;
		}

		const stream = new Stream.Readable({
			read: async () => {
				if (!this.readStreamHandlers[packet.pid]) {
					console.log(`Read() called despite handler already being deleted for ${packet.pid}`);
					return;
				}

				const data = this.readStreamHandlers[packet.pid].queue.shift();
				if (data === null) {
					stream.push(null);
					delete this.readStreamHandlers[packet.pid];
					return;
				}

				if (data !== undefined) {
					stream.push(data);
				} else {
					this.readStreamHandlers[packet.pid].readyForNextData = true;
				}
			}
		});
		this.readStreamHandlers[packet.pid] = { stream, queue: [], readyForNextData: false };

		const args = [stream, ...packet.arguments];
		await service[packet.methodName].apply(service, args);
	}

	private handleCoreMessage(message: string) {
		try {
			const packet: Packet | Packet[] = JSON.parse(message);
			if (Array.isArray(packet)) packet.forEach(p => this.handleCorePacket(p));
			else this.handleCorePacket(packet);
		} catch (err) {
			console.error(`Service Handler error: ${err}`);
			console.error(err);
		}
	}

	private handleCorePacket(packet: Packet) {
		if (PacketBuilder.isPing(packet)) this.send(PacketBuilder.pong(), CORE);
		else if (PacketBuilder.isServiceIPResolution(packet)) this.handleServiceIpResolution(packet);
		else {
			console.log(`Service Handler received unknown packet from core:`);
			console.log(packet);
		}
	}

	public send(packet: Packet, serviceIdentifier: string | ServiceConnection) {
		if (serviceIdentifier == CORE) {
			if (!this.connectedToCore) {
				console.error(`Cannot send packet to CORE because Service Handler is not connected to core`);
				return;
			}

			this.coreSocket.send(JSON.stringify(packet));
			return;
		}

		let connection = typeof serviceIdentifier == "object" ? serviceIdentifier : this.serviceConnections.find(c => c.identifier == serviceIdentifier);
		if (!connection && typeof serviceIdentifier == "string") {
			connection = this.connectToService(serviceIdentifier);
		}

		if (connection.socket == null) {
			connection.queue.push(packet);
			return;
		} else {
			const json = JSON.stringify(packet);
			connection.socket.send(json);
		}
	}

	private connectToService(serviceIdentifier: string) {
		const newConnObj: ServiceConnection = {
			socket: null,
			identifier: serviceIdentifier,
			queue: []
		};
		this.serviceConnections.push(newConnObj);
		this.setupServiceConnection(newConnObj);

		return newConnObj;
	}

	private setupServiceConnection(conn: ServiceConnection) {
		if (!this.connectedToCore) {
			console.error(`Cannot connect to ${conn.identifier} because Service Handler is not connected to core`);
			return;
		}

		const lookup = PacketBuilder.serviceIPLookup(conn.identifier);
		this.send(lookup, CORE);
	}

	private handleServiceIpResolution(packet: ServiceIPResolutionPacket) {
		const conn = this.serviceConnections.find(c => c.identifier == packet.serviceIdentifier);
		if (!conn) {
			console.error(`Service Handler received IP resolution for unregistered service ${packet.serviceIdentifier}`);
			return;
		}

		conn.socket = new WebSocket(`${proto}${packet.ip}:${packet.port}`);

		conn.socket.onopen = () => {
			conn.socket.send(JSON.stringify(PacketBuilder.auth(this.authKey)));
			conn.queue.forEach(p => conn.socket.send(JSON.stringify(p)));
			conn.queue = [];
		};
		conn.socket.onmessage = event => this.handleServiceMessage(event.data.toString(), conn);
		conn.socket.onerror = err =>
			console.error(`Service Handler socket error. URL: ${proto}${packet.ip}:${packet.port}, Service: ${packet.serviceIdentifier}, Err: ${err.message}`);
		conn.socket.onclose = () => {
			console.log(`Service Handler socket closed`);
			conn.socket = null;
			setTimeout(() => this.setupServiceConnection(conn), 250);
		};
	}

	private handleServiceMessage(message: string, conn: ServiceConnection) {
		try {
			const packet: Packet | Packet[] = JSON.parse(message);
			if (Array.isArray(packet)) packet.forEach(p => this.handleServicePacket(p, conn));
			else this.handleServicePacket(packet, conn);
		} catch (err) {
			console.error(`Service Handler error: ${err}`);
			console.error(err);
		}
	}

	private handleServicePacket(packet: Packet, conn: ServiceConnection) {
		if (PacketBuilder.isPing(packet)) this.send(PacketBuilder.pong(), conn);
		else if (PacketBuilder.isServiceCallResponse(packet)) this.handleReply(packet);
		else if (PacketBuilder.isFireEvent(packet)) this.handleFiredEvent(packet);
		else if (PacketBuilder.isStreamData(packet)) this.handleStreamData(packet, null);
		else console.log(`Service Handler received unknown packet from service ${conn.identifier}: ${JSON.stringify(packet)}`);
	}

	public register(serviceIdentifier: string, service: object) {
		this.registeredServices[serviceIdentifier] = service;
		if (this.connectedToCore) {
			this.send(PacketBuilder.registerService(serviceIdentifier, this.externalIp, this.serverPort), CORE);
			console.log(`Service Handler registered service ${serviceIdentifier}`);
		}
	}
}

export { ServiceConnector };
