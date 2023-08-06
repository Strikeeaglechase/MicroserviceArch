import { ServiceHandler } from "../serviceHandler.js"

class VTGRService extends ServiceHandler {
	static serviceName = "VTGRService";

	static dumpGameToFile(lobbyId: string): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["lobbyId"] = lobbyId;
		__args.push(lobbyId);
		return this.execServiceCall("VTGRService", "dumpGameToFile", __argsMap, __args);
	}

	static loadRecording(id: string): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["id"] = id;
		__args.push(id);
		return this.execServiceCall("VTGRService", "loadRecording", __argsMap, __args);
	}

	static readChunk(id: string, chunkId: number): Promise<string> {
		const __argsMap = {};
		const __args = [];
		__argsMap["id"] = id;
		__args.push(id);
		__argsMap["chunkId"] = chunkId;
		__args.push(chunkId);
		return this.execServiceCall("VTGRService", "readChunk", __argsMap, __args);
	}

	static unloadRecording(id: string): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["id"] = id;
		__args.push(id);
		return this.execServiceCall("VTGRService", "unloadRecording", __argsMap, __args);
	}

}



export { VTGRService }