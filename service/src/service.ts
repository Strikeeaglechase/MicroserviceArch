// import { Callable } from "../../serviceLib/dist/src/serviceHandler.js";
import { Callable } from "serviceLib/serviceHandler.js";

class MyMicroservice {
	@Callable
	private callableMethod(arg: string, ...rest: any[]): number {
		console.log(`CallableMethod executed with arg: ${arg}`);
		return 42;
	}


	public internalMethod(arg: string) {
		console.log(`InternalMethod executed with arg: ${arg}`);
	}
}

export { MyMicroservice };