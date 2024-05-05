import type * as ts from "typescript";
import type { TransformerExtras, PluginConfig } from "ts-patch";
import * as fs from "fs";
import * as path from "path";

const serviceCallableDecorator = `@Callable`;
const serviceEventDecorator = `@Event`;
const serviceReadStreamDecorator = `@ReadStream`;
const serviceWriteStreamDecorator = `@WriteStream`;

const libraryPath = locateLibrary();
const serviceDefsOutputDir = `${libraryPath}/src/serviceDefs`;
const pathToServiceHandler = `../serviceHandler.js`;
const sharedTypeIdents: { ident: string; path: string }[] = [
	{
		ident: `shared`,
		path: `../../../../VTOLLiveViewerCommon/dist/shared.js`
	},
	{
		ident: `rpc.js`,
		path: `../../../../VTOLLiveViewerCommon/dist/rpc.js`
	}
];

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

interface FileImports {
	filename: string;
	imports: { clause: string; module: string }[];
}

interface ClassInfo {
	name: string;
	filename: string;
}

const registeredMethods: ServiceMethod[] = [];
const registeredReadStreams: ServiceMethod[] = [];
const registeredWriteStreams: ServiceMethod[] = [];
const registeredEvents: ServiceEvent[] = [];
const fileImports: FileImports[] = [];
const classInfos: ClassInfo[] = [];

function handleServiceCallableMethod(className: string, name: string, node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	// Ensure not already registered
	if (registeredMethods.some(method => method.name == name && method.className == className)) return;
	// console.log(`${className}.${name} is service callable`);

	const args: ServiceArg[] = [];
	node.parameters.forEach(child => {
		args.push({ text: child.getText(), name: child.name.getText() });
	});

	let returnType = "void";
	if (node.type) returnType = node.type.getText();

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
	// console.log(`${className}.${name} is service readstream`);

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
	// console.log(`${className}.${name} is service readstream`);

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

const builtinTypes = [
	"string",
	"number",
	"boolean",
	"void",
	"any",
	"unknown",
	"never",
	"object",
	"null",
	"undefined",
	"bigint",
	"symbol",
	"Promise",
	"Record",
	"Array",
	"Map",
	"Set"
];

function handleServiceEventMethod(className: string, name: string, node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	// console.log(`${className}.${name} is service event`);

	const args: ServiceArg[] = [];
	node.parameters.forEach(child => {
		args.push({ text: child.getText(), name: child.name.getText() });
	});

	registeredEvents.push({ name, className, args });
}

function handleMethodDeclaration(filename: string, node: ts.MethodDeclaration, tsInstance: typeof ts, typeChecker: ts.TypeChecker) {
	if (!tsInstance.isClassDeclaration(node.parent)) return;
	if (!node.parent.name) return;

	const name = node.name.getText();
	const className = node.parent.name.getText();

	if (!classInfos.some(c => c.name === className)) classInfos.push({ name: className, filename });

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

	// const classNames = new Set<string>();
	// registeredMethods.forEach(method => {
	// 	classNames.add(method.className);
	// });

	classInfos.forEach(classInfo => {
		const className = classInfo.name;
		const path = `${serviceDefsOutputDir}/${className}.ts`;
		if (fs.existsSync(path)) fs.unlinkSync(path);

		const filter = (obj: { className: string }) => obj.className === className;
		const classMethods = registeredMethods.filter(filter);
		const classEvents = registeredEvents.filter(filter);
		const classReadStreams = registeredReadStreams.filter(filter);
		const classWriteStreams = registeredWriteStreams.filter(filter);
		const emptyImports: FileImports = { filename: classInfo.filename, imports: [] };
		const imports = fileImports.find(f => f.filename === classInfo.filename) ?? emptyImports;

		if (classMethods.length == 0 && classEvents.length == 0 && classReadStreams.length == 0 && classWriteStreams.length == 0) return;

		createClassServiceDefs(path, className, classMethods, classEvents, classReadStreams, classWriteStreams, imports);
	});
}

function createClassServiceDefs(
	path: string,
	className: string,
	methods: ServiceMethod[],
	events: ServiceEvent[],
	readStreams: ServiceMethod[],
	writeStreams: ServiceMethod[],
	imports: FileImports
) {
	let content = `import { ServiceHandler } from "${pathToServiceHandler}"\nimport { Readable } from "stream";\n\n`;
	imports.imports.forEach(imp => (content += `import ${imp.clause} from \"${imp.module}\"\n`));
	content += `\n`;

	content += `class ${className} extends ServiceHandler {\n`;
	content += `\tstatic serviceName = "${className}";\n\n`;

	const callables: { type: "method" | "read_stream" | "write_stream"; method: ServiceMethod }[] = [];
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
			case "method":
				action = "execServiceCall";
				break;
			case "read_stream":
				action = "execReadStreamCall";
				break;
			case "write_stream":
				action = "execWriteStreamCall";
				break;
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
				if (tsInstance.isImportDeclaration(node)) {
					// @ts-ignore
					const moduleSpecifier = node.moduleSpecifier.text;
					const importClause = node.importClause;
					// console.log(importClause.getText(), moduleSpecifier);

					if (!fileImports.some(f => f.filename === sourceFile.fileName)) fileImports.push({ filename: sourceFile.fileName, imports: [] });
					const fileImport = fileImports.find(f => f.filename === sourceFile.fileName);

					const sharedTypeIdent = sharedTypeIdents.find(ident => moduleSpecifier.includes(ident.ident));
					if (sharedTypeIdent) {
						fileImport.imports.push({ clause: importClause.getText(), module: sharedTypeIdent.path });
					}
				}

				if (tsInstance.isMethodDeclaration(node)) {
					handleMethodDeclaration(sourceFile.fileName, node, tsInstance, typeChecker);
				}

				return tsInstance.visitEachChild(node, visit, ctx);
			}

			const result = tsInstance.visitNode(sourceFile, visit);

			ran.add(sourceFile.fileName);
			if (files.every(f => ran.has(f))) {
				createServiceDefs();
			}

			return result;
		};
	};
}
