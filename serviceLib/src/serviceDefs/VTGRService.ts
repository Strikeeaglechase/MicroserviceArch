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

}



export { VTGRService }