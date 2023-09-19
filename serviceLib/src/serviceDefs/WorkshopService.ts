import { ServiceHandler } from "../serviceHandler.js"
import { Readable } from "stream";

class WorkshopService extends ServiceHandler {
	static serviceName = "WorkshopService";

	static getMissionInfo(workshopId: string, missionId: string): Promise<MissionInfo> {
		const __argsMap = {};
		const __args = [];
		__argsMap["workshopId"] = workshopId;
		__args.push(workshopId);
		__argsMap["missionId"] = missionId;
		__args.push(missionId);
		return this.execServiceCall("WorkshopService", "getMissionInfo", __argsMap, __args);
	}

}

export interface T {
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
	waypoints: {
        name: string;
        id: number;
        position: Vector3;
    }[];
	bullseye: Record<Team, number>;
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



export { WorkshopService }