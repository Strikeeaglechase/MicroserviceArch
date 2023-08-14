import { v4 as uuidv4 } from "uuid";

interface Packet {
	type: string;
	pid: string;
	timestamp: number;
}

interface PingPacket extends Packet {
	type: "ping";
}

interface PongPacket extends Packet {
	type: "pong";
}

interface AuthPacket extends Packet {
	type: "auth";
	authenticationKey: string;
}

interface SubscribeToEventPacket extends Packet {
	type: "subscribeToEvent";
	serviceIdentifier: string;
	eventName: string;
}

interface FireEventPacket extends Packet {
	type: "event";
	serviceIdentifier: string;
	eventName: string;
	arguments: any[];
}

interface RegisterServicePacket extends Packet {
	type: "registerService";
	serviceIdentifier: string;
}

interface ServiceSpecificMethodCallBase extends Packet {
	serviceIdentifier: string;
	methodName: string;
	arguments: any[];
}

interface ServiceSpecificMethodCallReplyBase extends Packet {
	orgPid: string;
}

interface ServiceCallPacket extends ServiceSpecificMethodCallBase {
	type: "serviceCall";
}

interface ServiceCallResponsePacket extends ServiceSpecificMethodCallReplyBase {
	type: "serviceCallResponse";
	returnValue: any;
}

interface ReadStreamStartPacket extends ServiceSpecificMethodCallBase {
	type: "readStreamStart";
}

interface WriteStreamStartPacket extends ServiceSpecificMethodCallBase {
	type: "writeStreamStart";
}

interface StreamDataPacket extends ServiceSpecificMethodCallReplyBase {
	type: "streamDataPacket";
	data: any;
	event: "data" | "end";
}

class PacketBuilder {
	private static pid() {
		return uuidv4();
	}

	private static base<T extends string>(type: T) {
		return {
			type: type,
			pid: this.pid(),
			timestamp: Date.now()
		};
	}

	public static ping(): PingPacket { return { ...this.base("ping") }; }
	public static isPing(packet: Packet): packet is PingPacket { return packet.type === "ping"; }

	public static pong(): PongPacket { return { ...this.base("pong") }; }
	public static isPong(packet: Packet): packet is PongPacket { return packet.type === "pong"; }

	public static auth(authenticationKey: string): AuthPacket { return { authenticationKey, ...this.base("auth") }; }
	public static isAuth(packet: Packet): packet is AuthPacket { return packet.type === "auth"; }

	public static registerService(serviceIdentifier: string): RegisterServicePacket { return { serviceIdentifier, ...this.base("registerService") }; }
	public static isRegisterService(packet: Packet): packet is RegisterServicePacket { return packet.type === "registerService"; }

	public static serviceCall(serviceIdentifier: string, methodName: string, args: any[]): ServiceCallPacket { return { serviceIdentifier, methodName, arguments: args, ...this.base("serviceCall") }; }
	public static isServiceCall(packet: Packet): packet is ServiceCallPacket { return packet.type === "serviceCall"; }

	public static serviceCallResponse(orgPid: string, returnValue: any): ServiceCallResponsePacket { return { orgPid, returnValue, ...this.base("serviceCallResponse") }; }
	public static isServiceCallResponse(packet: Packet): packet is ServiceCallResponsePacket { return packet.type === "serviceCallResponse"; }

	public static subscribeToEvent(serviceIdentifier: string, eventName: string): SubscribeToEventPacket { return { serviceIdentifier, eventName, ...this.base("subscribeToEvent") }; }
	public static isSubscribeToEvent(packet: Packet): packet is SubscribeToEventPacket { return packet.type === "subscribeToEvent"; }

	public static fireEvent(serviceIdentifier: string, eventName: string, args: any[]): FireEventPacket { return { serviceIdentifier, eventName, arguments: args, ...this.base("event") }; }
	public static isFireEvent(packet: Packet): packet is FireEventPacket { return packet.type === "event"; }

	public static readStreamStart(serviceIdentifier: string, methodName: string, args: any[]): ReadStreamStartPacket { return { serviceIdentifier, methodName, arguments: args, ...this.base("readStreamStart") }; }
	public static isReadStreamStart(packet: Packet): packet is ReadStreamStartPacket { return packet.type === "readStreamStart"; }

	public static writeStreamStart(serviceIdentifier: string, methodName: string, args: any[]): WriteStreamStartPacket { return { serviceIdentifier, methodName, arguments: args, ...this.base("writeStreamStart") }; }
	public static isWriteStreamStart(packet: Packet): packet is WriteStreamStartPacket { return packet.type === "writeStreamStart"; }

	public static streamDataPacket(orgPid: string, data: any, event: "data" | "end"): StreamDataPacket { return { orgPid, data, event, ...this.base("streamDataPacket") }; }
	public static isStreamData(packet: Packet): packet is StreamDataPacket { return packet.type === "streamDataPacket"; }
}

export {
	Packet,
	PacketBuilder,
	PingPacket,
	PongPacket,
	AuthPacket,
	RegisterServicePacket,
	ServiceCallPacket,
	ServiceCallResponsePacket,
	FireEventPacket,
	SubscribeToEventPacket,
	ReadStreamStartPacket,
	WriteStreamStartPacket,
	StreamDataPacket,
	ServiceSpecificMethodCallBase,
	ServiceSpecificMethodCallReplyBase
};