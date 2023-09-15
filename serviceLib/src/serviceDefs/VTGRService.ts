import { ServiceHandler } from "../serviceHandler.js"
import { Readable } from "stream";

class VTGRService extends ServiceHandler {
	static serviceName = "VTGRService";

	static dumpGameToFile(lobbyId: string): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["lobbyId"] = lobbyId;
		__args.push(lobbyId);
		return this.execServiceCall("VTGRService", "dumpGameToFile", __argsMap, __args);
	}

	static readRecordingBody(replayId: string) {
		const __argsMap = {};
		const __args = [];
		__argsMap["replayId"] = replayId;
		__args.push(replayId);
		return this.execReadStreamCall("VTGRService", "readRecordingBody", __argsMap, __args);
	}

	static readRecordingPackets(replayId: string) {
		const __argsMap = {};
		const __args = [];
		__argsMap["replayId"] = replayId;
		__args.push(replayId);
		return this.execReadStreamCall("VTGRService", "readRecordingPackets", __argsMap, __args);
	}

	static on(event: "vtgrFileFinalized", handler: (lobbyId: string, header: VTGRHeader) => void): void
	static on<T extends "vtgrFileFinalized">(event: T, handler: (...args: any[]) => void): void { this.registerEventHandler("VTGRService", event, handler); }
}

export interface VTGRHeader {
	info: RecordedLobbyInfo;
	id: string;
	chunks: VTGRDataChunk[];
	metadata?: VTGRMetadata;
}

export interface RecordedLobbyInfo {
	lobbyId: string;
	lobbyName: string;
	missionName: string;
	missionId: string;
	missionInfo: MissionInfo;
	campaignId: string;
	workshopId: string;
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

export interface VTGRMetadata {
	id: string;
	players: {
        name: string;
        id: string;
    }[];
	netInstantiates: number;
	totalPackets: number;
}



export { VTGRService }