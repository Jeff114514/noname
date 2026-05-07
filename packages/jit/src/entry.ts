/// <reference types="vite/client" />
(async function () {
	const scope = new URL("./", location.href).toString();
	// if (import.meta.env.DEV) {
	// 	if ("serviceWorker" in navigator) {
	// 		let registrations = await navigator.serviceWorker.getRegistrations();
	// 		await registrations.find(registration => registration?.active?.scriptURL == `${scope}service-worker.js`)?.unregister();
	// 	}
	// 	return;
	// }

	const globalText = {
		SERVICE_WORKER_NOT_SUPPORT: ["无法启用即时编译功能", "您使用的客户端或浏览器不支持启用serviceWorker"].join("\n"),
		SERVICE_WORKER_LOAD_FAILED: ["无法启用即时编译功能", "serviceWorker加载失败"].join("\n"),
	};

	// 非安全上下文（公网 HTTP、内网 IP 的 HTTP 等）无法注册 Service Worker，register 会失败。
	// 原逻辑在 catch 里会 reload，容易造成反复刷新、白屏。已构建的 JS 不依赖 SW 仍可正常游戏，仅失去 JIT/TS 即时编译。
	if (typeof window !== "undefined" && window.isSecureContext === false) {
		return;
	}

	if (!("serviceWorker" in navigator)) {
		alert(globalText.SERVICE_WORKER_NOT_SUPPORT);
		return;
	}

	// 初次加载worker，需要重新启动一次
	if (sessionStorage.getItem("isJITReloaded") !== "true") {
		let registrations = await navigator.serviceWorker.getRegistrations();
		await registrations.find(registration => registration?.active?.scriptURL == `${scope}service-worker.js`)?.unregister();
		sessionStorage.setItem("isJITReloaded", "true");
		window.location.reload();
		return;
	}

	try {
		await navigator.serviceWorker.register(`${scope}service-worker.js`, {
			type: "module",
			updateViaCache: "all",
			scope,
		});
		// 接收消息
		navigator.serviceWorker.addEventListener("message", e => {
			if (e.data?.type === "reload") {
				window.location.reload();
			}
		});
		// 发送消息
		// navigator.serviceWorker.controller?.postMessage({ action: "reload" });
		// await registration.update().catch(e => console.error("worker update失败", e));
		if (sessionStorage.getItem("canUseTs") !== "true") {
			const path = "/jit-test.ts";
			console.log((await import(/* @vite-ignore */ path)).text);
			sessionStorage.setItem("canUseTs", "true");
		}
	} catch (e) {
		// 不再因注册失败而整页重载，避免在 SW 不可用的环境（配置错误、HTTPS 混用等）死循环白屏
		console.warn("serviceWorker 注册失败，JIT 不可用，将使用已构建资源:", e);
		sessionStorage.setItem("canUseTs", "false");
	}
})();
