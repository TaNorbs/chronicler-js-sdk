import { InternalLogMessage, InternalMessage } from "./chronicler";

export type Log = Omit<InternalLogMessage, "severity"> & {
	timestamp: string,
	severity: number,
}

const messages: Log[] = [];
const MAXBUFFER = 5;
const RETRIES = 3;
let timeoutId: number = 0;

onmessage = function(event) {
	const data = event.data as InternalMessage;
	if (data.windowClosed) {
		saveLogs(data.url, data.key);
	}
	const logMessage = data.message;

	messages.push({
		severity: logMessage.severity.value,
		message: logMessage.message,
		stack: logMessage.stack ? logMessage.stack.substring(0, 500) : undefined,
		page: logMessage.page,
		userid: logMessage.userid,
		username: logMessage.username,
		//timestamp: Math.round(Date.now() / 1000)
		// NOTE: something more elegant?
		timestamp: new Date(Date.now()).toLocaleString("hu-HU").replace(". ", "-").replace(". ", "-").replace(".", "")
	})

	if (messages.length >= MAXBUFFER || logMessage.severity.value >= 2) {
		this.clearTimeout(timeoutId);
		timeoutId = 0;
		saveLogs(data.url, data.key)
	}
	else if (timeoutId === 0) {
		timeoutId = this.setTimeout(() => {
			saveLogs(data.url, data.key)
		}, 20000)
	}
}

function saveLogs(url: string, key?: string) {
	const promises: Promise<any>[] = []

	for (const message of messages) {
		promises.push(
			fetchRetry(async (count: number) => {
				fetch(url, {
					method: "POST",
					mode: "cors",
					headers: {
						"Content-Type": "application/json",
						"X-Log": key ?? "krikszkraksz"
					},
					body: JSON.stringify(message),
				}).catch(() => {
					if (count === RETRIES) console.error("Failed logging this message: ", message.message)
				})
			})
		)
	}

	Promise.allSettled(promises).then(() => {
		messages.length = 0;
	})
}

async function fetchRetry(callback: (count: number) => Promise<any>) {
	let count = 1;

	while (count <= RETRIES) {
		try {
			return await callback(count);
		} catch {
			count++;
			await new Promise(r => setTimeout(r, count * 300));
		}
	}
}
