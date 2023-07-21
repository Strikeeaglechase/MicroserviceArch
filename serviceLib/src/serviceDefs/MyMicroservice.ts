import { ServiceHandler } from "../serviceHandler.js"

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

	static on(event: "event", handler: (num: number) => void): void
	static on(event: "otherEvent", handler: (str: string) => void): void
	static on<T extends "event" | "otherEvent">(event: T, handler: (...args: any[]) => void): void { this.registerEventHandler("MyMicroservice", event, handler); }
}

export { MyMicroservice }