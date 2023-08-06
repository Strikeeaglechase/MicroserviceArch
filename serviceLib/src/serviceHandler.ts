import { ServiceConnector } from "./serviceConnector.js";

function Callable(target: any, propertyKey: string, descriptor: PropertyDescriptor) { }
function Event(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
	const orgMethod = descriptor.value;
	descriptor.value = function (...args: any[]) {
		// console.log(`Event ${propertyKey} called with args: ${args}`);
		const connector = ServiceConnector.instance;
		if (!connector) {
			console.log(`Service Handler not connected when calling event ${propertyKey}`);
		} else {
			connector.execEventCall(target.constructor.name, propertyKey, args);
		}

		orgMethod(...args);
	};
}

class ServiceHandler {
	static serviceName: string;

	protected static execServiceCall(className: string, method: string, argsMap: Record<string, any>, args: any[]): any {
		const connector = ServiceConnector.instance;
		if (!connector) {
			console.error(`Service Handler not connected when calling ${className}.${method}`);
			return;
		}

		return connector.execServiceCall(className, method, args);
	};

	protected static registerEventHandler(className: string, event: string, handler: (...args: any[]) => void) {
		const connector = ServiceConnector.instance;
		if (!connector) {
			console.error(`Service Handler not connected when registering event handler for ${event}`);
			return;
		}

		connector.registerEventHandler(className, event, handler);
	}
}

export { ServiceHandler, Callable, Event };