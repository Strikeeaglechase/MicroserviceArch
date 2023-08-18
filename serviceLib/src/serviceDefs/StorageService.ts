import { ServiceHandler } from "../serviceHandler.js"
import { Readable } from "stream";

class StorageService extends ServiceHandler {
	static serviceName = "StorageService";

	static writeData(key: string, data: string): Promise<void> {
		const __argsMap = {};
		const __args = [];
		__argsMap["key"] = key;
		__args.push(key);
		__argsMap["data"] = data;
		__args.push(data);
		return this.execServiceCall("StorageService", "writeData", __argsMap, __args);
	}

	static readData(key: string): Promise<string> {
		const __argsMap = {};
		const __args = [];
		__argsMap["key"] = key;
		__args.push(key);
		return this.execServiceCall("StorageService", "readData", __argsMap, __args);
	}

	static exists(key: string): Promise<boolean> {
		const __argsMap = {};
		const __args = [];
		__argsMap["key"] = key;
		__args.push(key);
		return this.execServiceCall("StorageService", "exists", __argsMap, __args);
	}

	static sizeof(key: string): Promise<number> {
		const __argsMap = {};
		const __args = [];
		__argsMap["key"] = key;
		__args.push(key);
		return this.execServiceCall("StorageService", "sizeof", __argsMap, __args);
	}

	static read(key: string) {
		const __argsMap = {};
		const __args = [];
		__argsMap["key"] = key;
		__args.push(key);
		return this.execReadStreamCall("StorageService", "read", __argsMap, __args);
	}

	static write(key: string) {
		const __argsMap = {};
		const __args = [];
		__argsMap["key"] = key;
		__args.push(key);
		return this.execWriteStreamCall("StorageService", "write", __argsMap, __args);
	}

}

export interface T {
}



export { StorageService }