import type * as ts from 'typescript';
import type { TransformerExtras, PluginConfig } from 'ts-patch';
import * as fs from "fs";
import * as path from "path";

const serviceCallableDecorator = `@Callable`;
const serviceEventDecorator = `@Event`;
const serviceReadStreamDecorator = `@ReadStream`;
const serviceWriteStreamDecorator = `@WriteStream`;

const libraryPath = locateLibrary();
const serviceDefsOutputDir = `${libraryPath}/src/serviceDefs`;
const pathToServiceHandler = `../serviceHandler.js`;

function locateLibrary() {
	let pathToCheck = `.`;

	while (true) {
		// console.log(`Checking ${path.resolve(pathToCheck + "/MicroserviceArch/serviceLib")}`);
		if (fs.existsSync(`${pathToCheck}/MicroserviceArch/serviceLib`)) return `${pathToCheck}/MicroserviceArch/serviceLib`;
		pathToCheck += `/..`;

		if (pathToCheck.length > 500) process.exit(1);
	}
}

interface ServiceArg {
	name: string;
	text: string;
}

interface ServiceMethod {
	name: string;
	className: string;
	args: ServiceArg[];
	returnType: string;
}

interface ServiceEvent {
	name: string;
	className: string;
	args: ServiceArg[];
}

interface ServiceExtraType {
	className: string;
	name: string;
	text: string;
}

const registeredMethods: ServiceMethod[] = [];
const registeredReadStreams: ServiceMethod[] = [];
const registeredWriteStreams: ServiceMethod[] = [];
const registeredEvents: ServiceEvent[] = [];
const registeredExtraTypes: ServiceExtraType[] = [];

function handleServiceCallableMethod(className: string, name: string, node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	// Ensure not already registered
	if (registeredMethods.some(method => method.name == name && method.className == className)) return;
	console.log(`${className}.${name} is service callable`);

	const args: ServiceArg[] = [];
	node.parameters.forEach(child => {
		args.push({ text: child.getText(), name: child.name.getText() });
	});

	let returnType = "void";
	if (node.type) returnType = processReturnType(className, node, tsInstance, typeChecker);

	registeredMethods.push({
		name,
		className,
		args,
		returnType
	});
}

function handleServiceReadStream(className: string, name: string, node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	// Ensure not already registered
	if (registeredReadStreams.some(method => method.name == name && method.className == className)) return;
	console.log(`${className}.${name} is service readstream`);

	const args: ServiceArg[] = [];
	// Slice 1 as first arg is the stream passed in by the library
	node.parameters.slice(1).forEach(child => {
		args.push({ text: child.getText(), name: child.name.getText() });
	});

	const returnType = "void";

	registeredReadStreams.push({
		name,
		className,
		args,
		returnType
	});
}

function handleServiceWriteStream(className: string, name: string, node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	// Ensure not already registered
	if (registeredReadStreams.some(method => method.name == name && method.className == className)) return;
	console.log(`${className}.${name} is service readstream`);

	const args: ServiceArg[] = [];
	// Slice 1 as first arg is the stream passed in by the library
	node.parameters.slice(1).forEach(child => {
		args.push({ text: child.getText(), name: child.name.getText() });
	});

	const returnType = "void";

	registeredWriteStreams.push({
		name,
		className,
		args,
		returnType
	});
}


function processReturnType(className: string, node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	if (!tsInstance.isTypeReferenceNode(node.type)) return node.type.getText();
	// const name = node.type.typeName.getText();
	maybeSaveTypeRefNode(className, node.type, tsInstance, typeChecker);

	return node.type.getText();
}

const builtinTypes = ["string", "number", "boolean", "void", "any", "unknown", "never", "object", "null", "undefined", "bigint", "symbol", "Promise", "Record", "Array", "Map", "Set"];
function maybeSaveTypeRefNode(className: string, node: ts.TypeReferenceNode, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	const name = node.typeName.getText();
	const symbol = typeChecker.getSymbolAtLocation(node.typeName);
	const type = typeChecker.getDeclaredTypeOfSymbol(symbol);

	maybeSaveType(className, type, tsInstance, typeChecker);

	if (node.typeArguments) {
		node.typeArguments.forEach(arg => {
			if (tsInstance.isArrayTypeNode(arg)) {
				const et = arg.elementType;
				if (tsInstance.isTypeReferenceNode(et)) maybeSaveTypeRefNode(className, et, tsInstance, typeChecker);
				return;
			} else if (!tsInstance.isTypeReferenceNode(arg)) {
				// console.log(arg);
				console.log(`Not a type reference node: ${arg.getText()}`);
				return;
			}
			maybeSaveTypeRefNode(className, arg, tsInstance, typeChecker);
		});
	}
}

function maybeSaveType(className: string, type: ts.Type, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	if (!type.symbol) {
		// @ts-ignore
		// console.log(`No symbol for type: ${type.intrinsicName} `);
		return;
	}
	const name = type.symbol.name;
	if ("resolvedTypeArguments" in type) {
		(type.resolvedTypeArguments as ts.Type[]).forEach(arg => {
			maybeSaveType(className, arg, tsInstance, typeChecker);
		});
	}
	if (builtinTypes.includes(name) || registeredExtraTypes.some(t => t.name == name && t.className == className)) return;
	// Create entry now to prevent cyclic dependency causing infinite loop
	const entry: ServiceExtraType = { className, name, text: "" };
	registeredExtraTypes.push(entry);

	const props = typeChecker.getPropertiesOfType(type);
	// Seems to be a enum? Enums are fucking weird, this is bad
	if ("types" in type) {
		const types = type.types as ts.LiteralType[];

		let result = `export enum ${name} {\n`;
		types.forEach(type => result += `\t${type.symbol.escapedName} = "${type.value}",\n`);
		result += "}";

		entry.text = result;
		return;
	}

	let result = `export interface ${name} {\n`;

	props.forEach(prop => {
		prop.declarations.forEach(decl => {
			if (tsInstance.isPropertySignature(decl) && decl.type) {
				const type = typeChecker.getTypeOfSymbolAtLocation(prop, decl);
				if (type.isUnionOrIntersection()) maybeSaveUnionType(className, decl, tsInstance, typeChecker);
				maybeSaveType(className, type, tsInstance, typeChecker);
			}


			result += `\t${decl.getFullText().trim()}\n`;
		});
	});

	result += `}`;

	entry.text = result;
}

function maybeSaveUnionType(className: string, decl: ts.PropertySignature, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	if (!tsInstance.isTypeReferenceNode(decl.type)) return;

	const symbol = typeChecker.getSymbolAtLocation(decl.type.typeName);
	symbol.declarations.forEach(subDecl => {
		if (!tsInstance.isTypeAliasDeclaration(subDecl) || !tsInstance.isUnionTypeNode(subDecl.type)) return;
		const name = subDecl.name.getText();
		if (registeredExtraTypes.some(t => t.name == name && t.className == className)) return;
		const entry: ServiceExtraType = { className, name, text: "" };
		registeredExtraTypes.push(entry);

		subDecl.type.types.forEach(type => {
			if (tsInstance.isTypeReferenceNode(type)) {
				maybeSaveTypeRefNode(className, type, tsInstance, typeChecker);
			}
		});
		entry.text = `export ${subDecl.getFullText().trim()}`;
	});
}

function handleServiceEventMethod(className: string, name: string, node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	console.log(`${className}.${name} is service event`);

	const args: ServiceArg[] = [];
	node.parameters.forEach(child => {
		if (tsInstance.isTypeReferenceNode(child.type)) maybeSaveTypeRefNode(className, child.type, tsInstance, typeChecker);
		args.push({ text: child.getText(), name: child.name.getText() });
	});

	registeredEvents.push({ name, className, args });
}

function handleMethodDeclaration(node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	if (!tsInstance.isClassDeclaration(node.parent)) return;
	if (!node.parent.name) return;

	const name = node.name.getText();
	const className = node.parent.name.getText();

	if (!node.modifiers) return;
	const decorators = node.modifiers.filter(modifier => tsInstance.isDecorator(modifier));
	if (decorators) {
		decorators.forEach(decorator => {
			const decoratorName = decorator.getText();

			if (decoratorName === serviceCallableDecorator) handleServiceCallableMethod(className, name, node, tsInstance, typeChecker);
			else if (decoratorName === serviceEventDecorator) handleServiceEventMethod(className, name, node, tsInstance, typeChecker);
			else if (decoratorName === serviceReadStreamDecorator) handleServiceReadStream(className, name, node, tsInstance, typeChecker);
			else if (decoratorName === serviceWriteStreamDecorator) handleServiceWriteStream(className, name, node, tsInstance, typeChecker);
		});
	}
}

let didWrite = false;
function createServiceDefs() {
	if (didWrite) {
		console.log(`Double call to createServiceDefs`);
		return;
	}
	didWrite = true;
	if (!fs.existsSync(serviceDefsOutputDir)) {
		fs.mkdirSync(serviceDefsOutputDir);
	}

	const classNames = new Set<string>();
	registeredMethods.forEach(method => {
		classNames.add(method.className);
	});

	classNames.forEach(className => {
		const path = `${serviceDefsOutputDir}/${className}.ts`;
		if (fs.existsSync(path)) fs.unlinkSync(path);

		const filter = (obj: { className: string; }) => obj.className === className;
		const classMethods = registeredMethods.filter(filter);
		const classEvents = registeredEvents.filter(filter);
		const classExtraTypes = registeredExtraTypes.filter(filter);
		const classReadStreams = registeredReadStreams.filter(filter);
		const classWriteStreams = registeredWriteStreams.filter(filter);

		createClassServiceDefs(path, className, classMethods, classEvents, classExtraTypes, classReadStreams, classWriteStreams);
	});
}

function createClassServiceDefs(path: string, className: string, methods: ServiceMethod[], events: ServiceEvent[], extraTypes: ServiceExtraType[], readStreams: ServiceMethod[], writeStreams: ServiceMethod[]) {
	let content = `import { ServiceHandler } from "${pathToServiceHandler}"\nimport { Readable } from "stream";\n\n`;
	content += `class ${className} extends ServiceHandler {\n`;
	content += `\tstatic serviceName = "${className}";\n\n`;

	const callables: { type: "method" | "read_stream" | "write_stream", method: ServiceMethod; }[] = [];
	methods.forEach(method => callables.push({ type: "method", method }));
	readStreams.forEach(method => callables.push({ type: "read_stream", method }));
	writeStreams.forEach(method => callables.push({ type: "write_stream", method }));

	// Write out service callable methods
	callables.forEach(callable => {
		const method = callable.method;

		let returnType = method.returnType;
		if (callable.type == "method" && !returnType.startsWith("Promise<")) returnType = `Promise<${returnType}>`;
		if (callable.type == "write_stream") returnType = ""; // Empty to allow inference
		if (callable.type == "read_stream") returnType = ""; // Empty to allow inference
		if (!returnType.startsWith(": ") && returnType.length > 0) returnType = ": " + returnType;

		content += `\tstatic ${method.name}(${method.args.map(a => a.text).join(", ")})${returnType} {\n`;
		content += `\t\tconst __argsMap = {};\n`;
		content += `\t\tconst __args = [];\n`;
		method.args.forEach(arg => {
			content += `\t\t__argsMap["${arg.name}"] = ${arg.name};\n`;
			content += `\t\t__args.push(${arg.name});\n`;
		});

		let action = "";
		switch (callable.type) {
			case "method": action = "execServiceCall"; break;
			case "read_stream": action = "execReadStreamCall"; break;
			case "write_stream": action = "execWriteStreamCall"; break;
		}

		content += `\t\treturn this.${action}("${className}", "${method.name}", __argsMap, __args);\n`;

		content += `\t}\n\n`;
	});

	// Write out service event "on" handlers
	if (events.length > 0) {
		let unionType = "";
		events.forEach(event => {
			content += `\tstatic on(event: "${event.name}", handler: (${event.args.map(a => a.text).join(", ")}) => void): void\n`;
			if (unionType.length > 0) unionType += " | ";
			unionType += `"${event.name}"`;
		});
		content += `\tstatic on<T extends ${unionType}>(event: T, handler: (...args: any[]) => void): void { this.registerEventHandler("${className}", event, handler); }\n`;
	}
	content += `}\n\n`;

	// Write out extra types
	extraTypes.forEach(type => {
		content += `${type.text}\n\n`;
	});

	content += `\n\nexport { ${className} }`;

	fs.writeFileSync(path, content);
}

let ran: Set<string> = new Set();

export default function (program: ts.Program, pluginConfig: PluginConfig, { ts: tsInstance }: TransformerExtras) {
	const typeChecker = program.getTypeChecker();
	return (ctx: ts.TransformationContext) => {
		const { factory } = ctx;

		const files = program.getRootFileNames();
		// console.log(files.map(f => f.fileName));

		return (sourceFile: ts.SourceFile) => {
			function visit(node: ts.Node): ts.Node {
				if (tsInstance.isMethodDeclaration(node)) {
					handleMethodDeclaration(node, tsInstance, typeChecker);
				}

				return tsInstance.visitEachChild(node, visit, ctx);
			}

			const result = tsInstance.visitNode(sourceFile, visit);

			ran.add(sourceFile.fileName);
			if (files.every(f => ran.has(f))) {
				console.log(`Reached last file, generating service defs`);
				createServiceDefs();
			}

			return result;
		};
	};
}