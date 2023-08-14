import { Readable, Stream, Writable } from "stream";
import { WebSocket } from "ws";

import {
	FireEventPacket, Packet, PacketBuilder, ReadStreamStartPacket, ServiceCallPacket,
	ServiceCallResponsePacket, StreamDataPacket, WriteStreamStartPacket
} from "./packets.js";

class ServiceConnector {
	private socket: WebSocket;
	public connected = false;

	private registeredServices: Record<string, object> = {};
	private replyHandlers: Record<string, (res: any) => void> = {};
	private eventHandlers: Record<`${string}.${string}`, ((...args: any[]) => void)[]> = {};
	private readStreamHandlers: Record<string, { stream: Readable, queue: Buffer[]; readyForNextData: boolean; }> = {};
	private writeStreamHandlers: Record<string, { stream: Writable; }>;

	public static instance: ServiceConnector;

	constructor(private url: string, private authKey: string) {
		ServiceConnector.instance = this;
	}

	public execServiceCall(serviceIdentifier: string, method: string, args: any[]) {
		const packet = PacketBuilder.serviceCall(serviceIdentifier, method, args);
		this.send(packet);
		return new Promise<any>(res => {
			this.replyHandlers[packet.pid] = res;
		});
	}

	public execReadStreamCall(serviceIdentifier: string, method: string, args: any[]) {
		const packet = PacketBuilder.readStreamStart(serviceIdentifier, method, args);
		this.send(packet);

		const stream = new Stream.Readable({
			read: async () => {
				const data = this.readStreamHandlers[packet.pid].queue.shift();
				if (data !== undefined) {
					stream.push(data);
				} else {
					this.readStreamHandlers[packet.pid].readyForNextData = true;
				}
			}
		});
		this.readStreamHandlers[packet.pid] = { stream, queue: [], readyForNextData: false };
		return stream;
	}

	public execWriteStreamCall(serviceIdentifier: string, method: string, args: any[]) {
		const packet = PacketBuilder.writeStreamStart(serviceIdentifier, method, args);
		this.send(packet);

		const stream = new Stream.Writable({
			write: (chunk, encoding, callback) => {
				const streamPacket = PacketBuilder.streamDataPacket(packet.pid, chunk, "data");
				this.send(streamPacket);
				callback();
			}
		});

		stream.on("close", () => {
			const streamPacket = PacketBuilder.streamDataPacket(packet.pid, null, "end");
			this.send(streamPacket);
		});

		return stream;
	}

	public execEventCall(serviceIdentifier: string, method: string, args: any[]) {
		const packet = PacketBuilder.fireEvent(serviceIdentifier, method, args);
		this.send(packet);
	}

	public registerEventHandler(serviceIdentifier: string, event: string, handler: (...args: any[]) => void) {
		const eventName = `${serviceIdentifier}.${event}`;
		if (!this.eventHandlers[eventName]) {
			this.eventHandlers[eventName] = [];
			this.send(PacketBuilder.subscribeToEvent(serviceIdentifier, event));
		}
		this.eventHandlers[eventName].push(handler);
	}

	private async handleServiceCall(packet: ServiceCallPacket) {
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
		this.send(PacketBuilder.serviceCallResponse(packet.pid, result));
	}

	public connect() {
		return new Promise<void>((res) => {
			this.socket = new WebSocket(this.url);
			this.socket.onopen = () => {
				this.handleOpen();
				res();
			};
			this.socket.onmessage = (event) => this.handleMessage(event.data.toString());
			this.socket.onerror = (err) => console.error(`Service Handler socket error: ${err.message}`);
			this.socket.onclose = () => {
				console.log(`Service Handler socket closed`);
				this.connected = false;
				setTimeout(() => this.connect().then(res), 250);
			};
		});
	}

	private handleOpen() {
		console.log(`Service Handler connected to ${this.url}`);
		this.connected = true;

		this.send(PacketBuilder.auth(this.authKey));

		Object.keys(this.registeredServices).forEach((serviceIdentifier) => {
			this.send(PacketBuilder.registerService(serviceIdentifier));
			console.log(`Service Handler registered service ${serviceIdentifier}`);
		});

		Object.keys(this.eventHandlers).forEach((event) => {
			const [serviceIdentifier, eventName] = event.split(".");
			this.send(PacketBuilder.subscribeToEvent(serviceIdentifier, eventName));
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

	private async handleReadStreamStart(packet: ReadStreamStartPacket) {
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
				this.send(streamPacket);
				callback();
			}
		});

		writeStream.on("close", () => {
			const streamPacket = PacketBuilder.streamDataPacket(packet.pid, null, "end");
			this.send(streamPacket);
		});

		const args = [writeStream, ...packet.arguments];
		await service[packet.methodName].apply(service, args);
	}

	private handleStreamData(packet: StreamDataPacket) {
		const stream = this.readStreamHandlers[packet.orgPid];
		if (!stream) {
			console.error(`Service Handler received stream data for unregistered stream ${packet.orgPid}`);
			return;
		}

		if (packet.event == "data") {
			if (stream.readyForNextData) {
				stream.readyForNextData = false;
				stream.stream.push(Buffer.from(packet.data));
			} else {
				stream.queue.push(Buffer.from(packet.data));
			}
		} else if (packet.event == "end") {
			if (stream.readyForNextData) stream.stream.push(null);
			else stream.queue.push(Buffer.from(packet.data));
			delete this.readStreamHandlers[packet.orgPid];
		}
	}

	private async handleWriteStreamStart(packet: WriteStreamStartPacket) {
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
				const data = this.readStreamHandlers[packet.pid].queue.shift();
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

	private handleMessage(message: string) {
		try {
			const packet: Packet = JSON.parse(message);
			if (PacketBuilder.isPing(packet)) this.send(PacketBuilder.pong());
			if (PacketBuilder.isServiceCall(packet)) this.handleServiceCall(packet);
			if (PacketBuilder.isServiceCallResponse(packet)) this.handleReply(packet);
			if (PacketBuilder.isFireEvent(packet)) this.handleFiredEvent(packet);
			if (PacketBuilder.isReadStreamStart(packet)) this.handleReadStreamStart(packet);
			if (PacketBuilder.isWriteStreamStart(packet)) this.handleWriteStreamStart(packet);
			if (PacketBuilder.isStreamData(packet)) this.handleStreamData(packet);
		}
		catch (err) {
			console.error(`Service Handler error: ${err}`);
		}
	}

	public send(packet: Packet) {
		if (!this.connected) {
			console.error(`Service Handler not connected`);
			return;
		}

		const json = JSON.stringify(packet);
		this.socket.send(json);
	}

	public register(serviceIdentifier: string, service: object) {
		this.registeredServices[serviceIdentifier] = service;
		if (this.connected) {
			this.send(PacketBuilder.registerService(serviceIdentifier));
			console.log(`Service Handler registered service ${serviceIdentifier}`);
		}
	}
}

export { ServiceConnector };