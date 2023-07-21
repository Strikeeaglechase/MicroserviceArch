import { Callable, Event } from "serviceLib/serviceHandler.js";

class MyMicroservice {
	@Callable
	private callableMethod(arg: string, ...rest: any[]): number {
		console.log(`CallableMethod executed with arg: ${arg}`);
		return 42;
	}


	@Event
	public event(num: number) { }

	@Event
	public otherEvent(str: string) { }
}

export { MyMicroservice };