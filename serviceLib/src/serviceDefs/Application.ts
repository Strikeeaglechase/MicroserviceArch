import { ServiceHandler } from "../serviceHandler.js"

class Application extends ServiceHandler {
	static serviceName = "Application";

	static getLobbyResyncRPCs(lobbyId: string): Promise<RPCPacket[]> {
		const __argsMap = {};
		const __args = [];
		__argsMap["lobbyId"] = lobbyId;
		__args.push(lobbyId);
		return this.execServiceCall("Application", "getLobbyResyncRPCs", __argsMap, __args);
	}

	static on(event: "lobbyConnected", handler: (lobbyId: string) => void): void
	static on(event: "lobbyDisconnected", handler: (lobbyId: string) => void): void
	static on(event: "lobbyData", handler: (lobbyId: string, data: RPCPacket[]) => void): void
	static on<T extends "lobbyConnected" | "lobbyDisconnected" | "lobbyData">(event: T, handler: (...args: any[]) => void): void { this.registerEventHandler("Application", event, handler); }
}



export { Application }