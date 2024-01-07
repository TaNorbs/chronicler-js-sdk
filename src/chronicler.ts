export const ChroniclerSeverity = Object.freeze({
	info: {
		name: "info",
		value: 0,
	},
	warning: {
		name: "warning",
		value: 1,
	},
	error: {
		name: "error",
		value: 2,
	},
	fatal: {
		name: "fatal",
		value: 99
	}
} as const)

type Severity = typeof ChroniclerSeverity[keyof typeof ChroniclerSeverity]

/*
 * The object that the user passes down
 */
export type UserMessage = {
	message: string,
	stack?: string,
	/*
		* A unique identifier of the user
		*/
	userid?: string | number,
	/*
		* A username or email which might be unique but could help in tracing the error
		*/
	username?: string
}

/*
 * The object that the logging functions pass down
 */
export type Message = UserMessage & {
	severity: Severity,
}

export type InternalLogMessage = Message & {
	page: string,
}

/*
 * The object that the web worker gets
 */
export type InternalMessage = {
	message: InternalLogMessage,
	url: string,
	windowClosed?: boolean,
	key?: string
}

type BaseEndpoint = {
	/*
		* The pocketbase endpoint without a trailing slash
		* ex.: https://127.0.0.1:8090.
		*/
	baseEndpoint: string,
	/*
		* The full endpoint for custom collection endpoint or custom logging backend
		* ex.: https://127.0.0.1:8090/api/collections/custom/records or whatever.
		*/
	customEndpoint?: never,
	/*
		* The full endpoint for custom collection endpoint for forms or custom logging backend
		* ex.: https://127.0.0.1:8090/api/collections/custom/forms or whatever.
		*/
	customFormEndpoint?: never,
}

type CustomEndpoint = {
	baseEndpoint?: never,
	customEndpoint: string,
	customFormEndpoint: string,
}

type CommonInitProps = {
	/**
		* 
		* It is preconfigured for Vite, only during production will be enabled by default, but can be overwritten.
		*/
	enable?: boolean,
	/*
		* The key in the header to prevent brainless bot spam, but it should be fine with the default value. DON'T forget to change this key in Pocketbase as well.
		*/
	key?: string,
	/*
		* With this function one does not need to pass the userid everytime a logging function is called. BUT will be overriden if the id is passed down.
		*/
	getUserid?: () => string | number | undefined,
	/*
		* With this function one does not need to pass the username / email / whatever everytime a logging function is called. BUT will be overriden if the username / ... is passed down.
		*/
	getUsername?: () => string | undefined,
}

export type ChroniclerInitProps = CommonInitProps & (CustomEndpoint | BaseEndpoint)

const DEFAULTENDPOINT = "/api/collections/logs/records"
const FORMDEFAULTENDPOINT = "/api/collections/usererror/records"
class ChroniclerClass {
	worker: Worker;
	configs: ChroniclerInitProps = { baseEndpoint: "", enable: false };
	url = "";
	formUrl = "";

	constructor() {
		this.worker = new Worker(new URL('./worker.ts', import.meta.url))
	}

	initialize(props: ChroniclerInitProps) {
		const configs = Helpers.ChroniclerInitialize(props);
		if (configs) {
			this.configs = configs;
			this.url = configs.customEndpoint ?? Helpers.trimUrl(configs.baseEndpoint) + DEFAULTENDPOINT;
			this.formUrl = configs.customFormEndpoint ?? Helpers.trimUrl(configs.baseEndpoint) + FORMDEFAULTENDPOINT;

			window.addEventListener("beforeunload", () => {
				this.worker.postMessage({ windowClosed: true, url: this.url, key: this.configs.key });
			})
		}
	}

	log(message: Message) {
		if (!this.configs.enable || !this.url) return;

		// @ts-ignore
		message.page = window.location.toString()
		message.userid = message.userid ?? this.configs.getUserid?.()
		message.username = message.username ?? this.configs.getUsername?.()
		this.worker.postMessage({ message, url: this.url, key: this.configs.key })
	}

	info(message: UserMessage | string) {
		if (typeof message === "string") this.log({ message, severity: ChroniclerSeverity.info })
		else this.log({ ...message, severity: ChroniclerSeverity.info })
	}

	warning(message: UserMessage | string) {
		if (typeof message === "string") this.log({ message, severity: ChroniclerSeverity.warning })
		else this.log({ ...message, severity: ChroniclerSeverity.warning })
	}

	error(message: UserMessage | string) {
		if (typeof message === "string") this.log({ message, severity: ChroniclerSeverity.error })
		else this.log({ ...message, severity: ChroniclerSeverity.error })
	}

	fatal(message: UserMessage | string) {
		if (typeof message === "string") this.log({ message, severity: ChroniclerSeverity.fatal })
		else this.log({ ...message, severity: ChroniclerSeverity.fatal })
	}

	sendUserErrorForm(data: { title: string, body: string, page?: string }) {
		data.page = window.location.href;
		fetch(this.formUrl, {
			method: "POST",
			mode: "cors",
			headers: {
				"Content-Type": "application/json",
				"X-Log": this.configs.key ?? "krikszkraksz"
			},
			body: JSON.stringify(data),
		}).catch(() => {
			console.error("Failed to upload user error form!")
		})
	}
}

class Helpers {
	static ChroniclerInitialize(props: ChroniclerInitProps | undefined) {
		if (!props) return;
		if (this._isLoggingDisabled(props.enable)) return;

		props.enable = true;
		return props;
	}
	static _isLoggingDisabled(enable?: boolean) {
		if (typeof enable === "boolean") return !enable;
		// @ts-ignore
		// If used with Vite
		if (typeof import.meta?.env?.DEV === "boolean") return import.meta.env.DEV;

		return false;
	}
	// TEST: test this
	static trimUrl(url: string){
		let offset = 1;
		while(url[url.length - offset] === "/"){
			offset++;
		}

		return url.slice(0, url.length - offset - 1);
	}
}

const Chronicler = new ChroniclerClass();
export default Chronicler;
