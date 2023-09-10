import { ServiceHandler } from "../serviceHandler.js"
import { Readable } from "stream";

class DBService extends ServiceHandler {
	static serviceName = "DBService";

	static getAllRecordedLobbies(): Promise<VTGRHeader[]> {
		const __argsMap = {};
		const __args = [];
		return this.execServiceCall("DBService", "getAllRecordedLobbies", __argsMap, __args);
	}

	static getRecordedLobby(id: string): Promise<VTGRHeader> {
		const __argsMap = {};
		const __args = [];
		__argsMap["id"] = id;
		__args.push(id);
		return this.execServiceCall("DBService", "getRecordedLobby", __argsMap, __args);
	}

	static getUser(id: string): Promise<DbUserEntry> {
		const __argsMap = {};
		const __args = [];
		__argsMap["id"] = id;
		__args.push(id);
		return this.execServiceCall("DBService", "getUser", __argsMap, __args);
	}

	static createUser(user: DbUserEntry): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["user"] = user;
		__args.push(user);
		return this.execServiceCall("DBService", "createUser", __argsMap, __args);
	}

	static searchUserByName(query: string): Promise<DbUserEntry[]> {
		const __argsMap = {};
		const __args = [];
		__argsMap["query"] = query;
		__args.push(query);
		return this.execServiceCall("DBService", "searchUserByName", __argsMap, __args);
	}

	static updateUserScopes(id: string, scopes: UserScopes[]): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["id"] = id;
		__args.push(id);
		__argsMap["scopes"] = scopes;
		__args.push(scopes);
		return this.execServiceCall("DBService", "updateUserScopes", __argsMap, __args);
	}

	static updateUserLastLogin(id: string, userObj: HCUser): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["id"] = id;
		__args.push(id);
		__argsMap["userObj"] = userObj;
		__args.push(userObj);
		return this.execServiceCall("DBService", "updateUserLastLogin", __argsMap, __args);
	}

	static addRecordedLobbyPacket(packet: RecordedLobbyPacket): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["packet"] = packet;
		__args.push(packet);
		return this.execServiceCall("DBService", "addRecordedLobbyPacket", __argsMap, __args);
	}

	static getAllLobbyPackets(lobbyId: string): Promise<RecordedLobbyPacket[]> {
		const __argsMap = {};
		const __args = [];
		__argsMap["lobbyId"] = lobbyId;
		__args.push(lobbyId);
		return this.execServiceCall("DBService", "getAllLobbyPackets", __argsMap, __args);
	}

	static addStoredLobbyHeader(header: VTGRHeader): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["header"] = header;
		__args.push(header);
		return this.execServiceCall("DBService", "addStoredLobbyHeader", __argsMap, __args);
	}

	static deleteRecordedLobbyPackets(lobbyId: string): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["lobbyId"] = lobbyId;
		__args.push(lobbyId);
		return this.execServiceCall("DBService", "deleteRecordedLobbyPackets", __argsMap, __args);
	}

	static getLobbyPacketStream(lobbyId: string) {
		const __argsMap = {};
		const __args = [];
		__argsMap["lobbyId"] = lobbyId;
		__args.push(lobbyId);
		return this.execReadStreamCall("DBService", "getLobbyPacketStream", __argsMap, __args);
	}

}

export interface T {
}

export interface VTGRHeader {
	info: RecordedLobbyInfo;
	id: string;
	chunks: VTGRDataChunk[];
}

export interface RecordedLobbyInfo {
	lobbyId: string;
	lobbyName: string;
	missionName: string;
	missionId: string;
	missionInfo: MissionInfo;
	campaignId: string;
	type: string;
	map: string;
	recordingId: string;
	duration: number;
	startTime: number;
}

export interface MissionInfo {
	spawns: {
        name: string;
        id: number;
    }[];
	allUnitSpawns: {
        name: string;
        id: number;
    }[];
	name: string;
	id: string;
	campaignId: string;
	workshopId: string;
	mapId: string;
	isBuiltin: boolean;
}

export interface __type {
	name: string;
	id: number;
}

export interface VTGRDataChunk {
	start: number;
	length: number;
}

export interface DbUserEntry {
	id: string;
	scopes: UserScopes[];
	lastLoginTime: number;
	createdAt: number;
	lastUserObject: HCUser;
}

export enum UserScopes {
	ALPHA_ACCESS = "alpha_access",
	USER = "user",
	ADMIN = "admin",
}

export interface HCUser {
	id: string;
	username: string;
	authType: AuthType;
	scopes: UserScopes[];
	pfpUrl: string;
	exp?: number;
	iat?: number;
}

export enum AuthType {
	STEAM = "steam",
	BYPASS = "bypass",
}

export interface RecordedLobbyPacket {
	id: string;
	lobbyId: string;
	timestamp: number;
	type: "packet" | "event" | "init";
	data: string;
}



export { DBService }