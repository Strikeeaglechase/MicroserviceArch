import type * as ts from 'typescript';
import type { TransformerExtras, PluginConfig } from 'ts-patch';
import fs from "fs";

const serviceCallableDecorator = `@Callable`;
const libraryPath = locateLibrary();
const serviceDefsOutputDir = `${libraryPath}/src/serviceDefs`;
const pathToServiceHandler = `../serviceHandler`;

function locateLibrary() {
	let pathToCheck=`.`;

	while(true) {
		if(fs.existsSync(`${pathToCheck}/serviceLib`)) return `${pathToCheck}/serviceLib`;
		pathToCheck += `/..`;
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

const registeredMethods: ServiceMethod[] = [];

function handleMethodDeclaration(node: ts.MethodDeclaration, tsInstance: typeof ts) {
	if (!tsInstance.isClassDeclaration(node.parent)) return;
	if (!node.parent.name) return;

	const name = node.name.getText();
	const className = node.parent.name.getText();

	if (!node.modifiers) return;
	const decorators = node.modifiers.filter(modifier => tsInstance.isDecorator(modifier));
	if (decorators) {
		decorators.forEach(decorator => {
			const decoratorName = decorator.getText();

			if (decoratorName === serviceCallableDecorator) {
				console.log(`${className}.${name} is service callable`);

				const args: ServiceArg[] = [];
				node.parameters.forEach(child => {
					args.push({ text: child.getText(), name: child.name.getText() });
				});

				let returnType = "void";
				if (node.type) {
					returnType = node.type.getText();
					// console.log(`Return type: ${returnType}`);
				}

				registeredMethods.push({
					name,
					className,
					args,
					returnType
				});
			}
		});
	}
}

function createServiceDefs() {
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

		const classMethods = registeredMethods.filter(method => method.className === className);
		createClassServiceDefs(path, className, classMethods);
	});
}

function createClassServiceDefs(path: string, className: string, methods: ServiceMethod[]) {
	let content = `import { ServiceHandler } from "${pathToServiceHandler}"\n\n`;
	content += `class ${className} extends ServiceHandler {\n`;
	content += `\tstatic serviceName = "${className}";\n\n`;
	methods.forEach(method => {
		let returnType = method.returnType;
		if (!returnType.startsWith("Promise<") && returnType != "void") returnType = `Promise<${returnType}>`;

		content += `\tstatic ${method.name}(${method.args.map(a => a.text).join(", ")}): ${returnType} {\n`;
		content += `\t\tconst __args = {};\n`;
		method.args.forEach(arg => {
			content += `\t\t__args["${arg.name}"] = ${arg.name};\n`;
		});
		content += `\t\treturn this.execServiceCall("${className}", "${method.name}", __args);\n`;
		content += `\t}\n\n`;
	});
	content += `}\n\nexport { ${className} }`;

	fs.writeFileSync(path, content);
}

export default function (program: ts.Program, pluginConfig: PluginConfig, { ts: tsInstance }: TransformerExtras) {
	return (ctx: ts.TransformationContext) => {
		const { factory } = ctx;

		const files = program.getRootFileNames();
		// console.log(files.map(f => f.fileName));

		return (sourceFile: ts.SourceFile) => {
			function visit(node: ts.Node): ts.Node {
				if (tsInstance.isSourceFile(node)) {
					const name = node.fileName;
					// console.log(`SourceFile: ${name}`);
				}

				if (tsInstance.isMethodDeclaration(node)) {
					handleMethodDeclaration(node, tsInstance);
				}

				return tsInstance.visitEachChild(node, visit, ctx);
			}

			const result = tsInstance.visitNode(sourceFile, visit);

			if (sourceFile.fileName == files[files.length - 1]) {
				console.log(`Reached last file, generating service defs`);
				createServiceDefs();
			}

			return result;
		};
	};
}