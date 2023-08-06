import { ServiceHandler } from "../serviceHandler.js"

class AuthService extends ServiceHandler {
	static serviceName = "AuthService";

	static readToken(token: string): Promise<HCUser> {
		const __argsMap = {};
		const __args = [];
		__argsMap["token"] = token;
		__args.push(token);
		return this.execServiceCall("AuthService", "readToken", __argsMap, __args);
	}

	static cloneJWT(user: HCUser): Promise<string> {
		const __argsMap = {};
		const __args = [];
		__argsMap["user"] = user;
		__args.push(user);
		return this.execServiceCall("AuthService", "cloneJWT", __argsMap, __args);
	}

}

export interface HCUser {
	id: string;
	username: string;
	authType: AuthType;
	scopes: UserScopes[];
	pfpUrl: string;
	exp?: number;
	iat?: number;
}

export enum AuthType {
	STEAM = "steam",
	BYPASS = "bypass",
}

export enum UserScopes {
	ALPHA_ACCESS = "alpha_access",
	USER = "user",
	ADMIN = "admin",
}

export interface T {
}



export { AuthService }