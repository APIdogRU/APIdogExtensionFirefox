/*
 * APIdog LongPoll extension for Firefox
 * v1.2
 * 29/03/2015
 */

var data = require("sdk/self").data,
	Request = require("sdk/request").Request;

require("sdk/page-mod").PageMod({
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
		access_token: userAccessToken,
		https: 1
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
	var url = "https://" + o.server + "?act=a_check&key=" + o.key + "&ts=" + o.ts + "&wait=25&mode=66";
	Request({
		url: url,
		onComplete: function (response) {
			if (response && response.json)
				handleLongPollData(response.json, o);
			else
				handleLongPollConnectionError({
					response: response,
					request: this
				}, o);
		}
	}).get();
};
function handleLongPollData (j, o) {
	if (!j || j.failed)
		return start(o.userAccessToken, o.port);

	o.ts = j.ts;

	o.port.emit("getLongPollData", {updates: j.updates});
	getLongPoll(o);
};
function handleLongPollConnectionError (error, o) {
	o.port.emit("getLongPollError", {error: error});
	start(o.userAccessToken, o.port);
};

function API (method, params, callback) {
	Request({
		url: "https://api.vk.com/method/" + method,
		content: params,
		onComplete: function (response) { callback(response.json) }
	}).post();
};