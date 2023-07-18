function Callable(target: any, propertyKey: string, descriptor: PropertyDescriptor) { }

class ServiceHandler {
	static serviceName: string;

	protected static execServiceCall(className: string, method: string, args: Record<string, any>): any {

	};
}

export { ServiceHandler, Callable };