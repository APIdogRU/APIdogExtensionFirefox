var data = require("sdk/self").data,
	pageMod = require("sdk/page-mod"),
	Request = require("sdk/request").Request;

pageMod.PageMod({
	include: "*.apidog.ru",
	contentScriptFile: data.url("longpoll.js"),
	contentScriptWhen: "ready",
	onAttach: function (worker) {
		worker.port.emit("getAccessToken");
		worker.port.on("handleAccessToken", function (userAccessToken) {
			start(userAccessToken, worker.port);
		});
	}
});

function start (userAccessToken, port) {
	API("messages.getLongPollServer", {
		access_token: userAccessToken
	}, function (data) {
		if (!data.response) {
			data = data.error;
			port.emit("getLongPollData", {errorId: data.error_code, error: data});
			return;
		};
		data = data.response;
		getLongPoll({
			port: port,
			userAccessToken: userAccessToken,
			server: data.server,
			key: data.key,
			ts: data.ts
		});
	});
};

function getLongPoll (o) {
	var url = "http://" + o.server + "?act=a_check&key=" + o.key + "&ts=" + o.ts + "&wait=25&mode=66";
	Request({
		url: "http://" + o.server + "?act=a_check&key=" + o.key + "&ts=" + o.ts + "&wait=25&mode=66",
		onComplete: function (response) {
			handleLongPollData(response.json, o);
		}
	}).get();
};
function handleLongPollData (j, o) {
	if (j.failed)
		return start(o.userAccessToken, o.port);

	o.ts = j.ts;

	o.port.emit("getLongPollData", {updates: j.updates});
	getLongPoll(o);
};

function API (method, params, callback) {
	Request({
		url: "https://api.vk.com/method/" + method,
		content: params,
		onComplete: function (response) {
			callback(response.json);
		}
	}).post();
};