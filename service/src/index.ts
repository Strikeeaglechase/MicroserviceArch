import { ServiceConnector } from "serviceLib/serviceConnector.js";

import { MyMicroservice } from "./service.js";

const service = new MyMicroservice();

const connector = new ServiceConnector("ws://localhost:8000", "12348iaisdhu3");
connector.connect();
connector.register("MyMicroservice", service);