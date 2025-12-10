import { config } from "dotenv";

import { Application } from "./coreApp.js";

config();

process.on("unhandledRejection", error => {
	console.error(error);
});
process.on("uncaughtException", error => {
	console.error(error);
});

const app = new Application(parseInt(process.env.PORT), process.env.SERVICE_KEY);
app.init();

// setTimeout(() => {
// 	console.log("========= CORE APP TEST DISCONNECT ========");
// 	app.simulateTimeoutAll();
// }, 10_000);
