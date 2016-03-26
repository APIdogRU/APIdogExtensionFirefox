var data = require("sdk/self").data,
	pageMod = require("sdk/page-mod"),
	request = require("sdk/request"),

	inited = false;

pageMod.PageMod({
	include: "*.apidog.ru",
	contentScriptFile: [
		"./APIdogLib.js",
		"./longpoll.js"
	],
	contentScriptWhen: "ready",
	onAttach: function (worker) {
		worker.port.on("onAccessTokenReceived", function (data) {

			if (!data.useraccesstoken) {
				return;
			};

			LongPoll.init(data.useraccesstoken, worker.port);
		});

		worker.port.on("onAPIRequestExecute", function (data) {

			API(data.requestMethod, data.requestParams, function (result) {

				worker.port.emit("onAPIRequestExecuted", {
					requestId: data.requestId,
					requestResult: result
				});

			});

		});
	}
});

var
	ERROR_NO_RESPONSE_VKAPI = 1,
	ERROR_WHILE_REQUEST_LONGPOLL = 2;


/**
 * Вся грязная работа по LongPoll
 */
var LongPoll = {

	userAccessToken: null,
	params: null,
	port: null,

	/**
	 * Инициализация LongPoll
	 */
	init: function (userAccessToken, port) {

		this.userAccessToken = userAccessToken;
		this.port = port;
		this.getServer();
	},

	/**
	 * Получение адреса сервера LongPoll
	 */
	getServer: function () {
		var self = this;

		API("messages.getLongPollServer", {
			access_token: this.userAccessToken
		}, function (data) {

			if (!data.response) {
				data = data.error;
				this.sendError("onAccessTokenReceived", ERROR_NO_RESPONSE_VKAPI, data);
				return;
			};

			self.params = data.response;
			self.request();

		});
	},

	/**
	 * Запрос к LongPoll для получения новых событий
	 */
	request: function () {
		var self = this;
		new RequestTask("https://" + this.params.server + "?act=a_check&key=" + this.params.key + "&ts=" + this.params.ts + "&wait=25&mode=66")
			.setOnComplete(function (result) {

				self.params.ts = result.result.ts;
				self.request();
				self.sendEvents(result.result.updates);

			})
			.setOnError(function (event) {

				this.sendError("onLongPollConnectionError", ERROR_WHILE_REQUEST_LONGPOLL, event);
				this.getServer();

			})
			.post();
	},

	/**
	 * Отправка событий на сайт
	 */
	sendEvents: function (items) {
		this.port.emit("onLongPollDataReceived", {
			updates: items
		});
	},

	/**
	 * Отправка событий на сайт
	 */
	sendError: function (method, errorId, event) {
		this.port.emit(method, {
			errorId: errorId,
			error: event
		});
	},


};

/**
 * Запрос на любой сайт
 */
function RequestTask (url, params) {
	var context = this;
	this.xhr = request.Request({
		url: url,
		headers: {
			"User-Agent": "VKAndroidApp/4.38-816 (Android 6.0; SDK 23; x86;  Google Nexus 5X; ru)"
		},
		content: params,
		anonymous: true,
		onComplete: function (response) {
			context.onComplete && context.onComplete({
				result: response.json || {},
				isSuccess: true
			});
		},
		onError: function (error) {
			context.onError && context.onError({
				result: null,
				event: error,
				xhr: this
			});
		}
	});
};

RequestTask.prototype = {

	onComplete: null,
	onError: null,

	setOnComplete: function (onComplete) {
		this.onComplete = onComplete;
		return this;
	},

	setOnError: function (onError) {
		this.onError = onError;
		return this;
	},

	get: function () {
		this.xhr.get();
		return this;
	},

	post: function () {
		this.xhr.post();
		return this;
	}

};

/**
 * Запрос к API ВКонтакте
 */
 function API (method, params, callback) {
 	params = params || {};
 	params.https = 1;
	var request = new RequestTask("https://api.vk.com/method/" + method, params)
		.setOnComplete(function (result) {
			if (result.isSuccess) {
				callback(result.result);
			} else {
				console.error(result); // TODO: как-то реагировать на ошибку
			}
		})
		.post();
};