import fs from "fs";
import { ServiceConnector } from "serviceLib/serviceConnector.js";
import { MyMicroservice } from "serviceLib/serviceDefs/MyMicroservice.js";

async function test() {
	const connector = new ServiceConnector("ws://localhost:8000", "12348iaisdhu3");
	await connector.connect();

	const reply = await MyMicroservice.callableMethod("Hello World!");
	console.log(`Reply: ${reply}`);

	MyMicroservice.on("event", (n) => {
		console.log(`Received event: ${n}`);
	});
	MyMicroservice.on("otherEvent", (s) => {
		console.log(`Received other event: ${s}`);
	});

	// const readStream = MyMicroservice.readFromService("../tsconfig.json");
	// readStream.on("data", (data) => {
	// 	console.log(`Received data: ${data.length}`);
	// });

	// readStream.on("end", () => {
	// 	console.log(`Stream ended`);
	// });

	const readStream = fs.createReadStream("../tsconfig.json");
	const writeStream = MyMicroservice.writeToService("../test.json");

	readStream.pipe(writeStream);
}

test();