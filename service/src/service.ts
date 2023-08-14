import fs from "fs";
import { Callable, Event, ReadStream, WriteStream } from "serviceLib/serviceHandler.js";
import { Readable, Writable } from "stream";

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

	@ReadStream
	public readFromService(stream: Writable, filename: string) {
		const file = fs.createReadStream(filename);
		file.pipe(stream);
	}

	@WriteStream
	public writeToService(stream: Readable, filename: string) {
		const file = fs.createWriteStream(filename);
		stream.pipe(file);
	}
}

export { MyMicroservice };