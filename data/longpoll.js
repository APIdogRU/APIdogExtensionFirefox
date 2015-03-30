/*
 * APIdog LongPoll extension for Firefox
 * v1.2
 * 29/03/2015
 */

function sendEvent (method, data, callback) {
	var e = document.createElement("apidogExtensionTransport");
	e.setAttribute("method", method);
	if (callback)
		e.setAttribute("callback", callback);
	for (var i in data)
		e.setAttribute(i, JSON.stringify(data[i]));
	document.documentElement.appendChild(e);
	var event = document.createEvent("HTMLEvents");
	event.initEvent("apidogExtensionReceiver", true, false);
	e.dispatchEvent(event);
	console.log("APIdogExtensionReceiverSendEvent<" + method + ">:", data);
};

document.addEventListener("apidogExtensionReceiverOut", function (event) {
	var data = convertEventToObject(event);
	console.log("APIdogExtensionReceiverOut<" + data.method + ">: ", data);
	switch (data.method) {
		case "onAccessTokenReceived":
			self.port.emit("handleAccessToken", data.useraccesstoken);
			break;
	};
}, false, true);
function convertEventToObject (event) {
	var object = {}, e = event.target.attributes;
	for (var i = 0, l = e.length; i < l; ++i)
		object[e[i].name] = e[i].value;
	return object;
};
self.port.on("getAccessToken", function (event) {
	sendEvent("onAccessTokenRequire", {}, "onAccessTokenReceived");
});
self.port.on("getLongPollData", function (event) {
	sendEvent("onLongPollDataReceived", {updates: event.updates});
});
self.port.on("getLongPollError", function (event) {
	sendEvent("onLongPollConnectionError", {error: event.error});
});