export interface ServerOptions {
	port?: number;
	configDir?: string;
}

export interface ServerInstance {
	start(): Promise<void>;
	stop(): Promise<void>;
}
