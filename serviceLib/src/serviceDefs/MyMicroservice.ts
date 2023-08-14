import { ServiceHandler } from "../serviceHandler.js"
import { Readable } from "stream";

class MyMicroservice extends ServiceHandler {
	static serviceName = "MyMicroservice";

	static callableMethod(arg: string, ...rest: any[]): Promise<number> {
		const __argsMap = {};
		const __args = [];
		__argsMap["arg"] = arg;
		__args.push(arg);
		__argsMap["rest"] = rest;
		__args.push(rest);
		return this.execServiceCall("MyMicroservice", "callableMethod", __argsMap, __args);
	}

	static readFromService(filename: string) {
		const __argsMap = {};
		const __args = [];
		__argsMap["filename"] = filename;
		__args.push(filename);
		return this.execReadStreamCall("MyMicroservice", "readFromService", __argsMap, __args);
	}

	static writeToService(filename: string) {
		const __argsMap = {};
		const __args = [];
		__argsMap["filename"] = filename;
		__args.push(filename);
		return this.execWriteStreamCall("MyMicroservice", "writeToService", __argsMap, __args);
	}

	static on(event: "event", handler: (num: number) => void): void
	static on(event: "otherEvent", handler: (str: string) => void): void
	static on<T extends "event" | "otherEvent">(event: T, handler: (...args: any[]) => void): void { this.registerEventHandler("MyMicroservice", event, handler); }
}



export { MyMicroservice }