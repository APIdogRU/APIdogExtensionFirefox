var data = require("sdk/self").data,
	pageMod = require("sdk/page-mod"),
	request = require("sdk/request"),

	inited = false;

pageMod.PageMod({
	include: "*.apidog.ru",
	contentScriptFile: [
		"./APIdogLib.js"
	],
	contentScriptWhen: "ready",
	onAttach: function (worker) {
		worker.port.on("onAccessTokenReceived", function (data) {

			if (!data.useraccesstoken) {
				return;
			};

			LongPoll.init(data.useraccesstoken, worker);
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
	workers: [],
	last: 0,

	/**
	 * Инициализация LongPoll
	 */
	init: function (userAccessToken, worker) {
		var now = parseInt(Date.now() / 1000);

		this.workers.indexOf(worker) < 0 && this.workers.push(worker);

		if (this.last && now - this.last < 60) {
			return;
		};

		this.userAccessToken = userAccessToken;
		this.getServer();
		this.setLast();
	},

	/**
	 * Получение адреса сервера LongPoll
	 */
	getServer: function () {
		var s = this;

		API("messages.getLongPollServer", {
			access_token: s.userAccessToken
		}, function (data) {

			if (!data.response) {
				data = data.error;
				s.sendError("onAccessTokenReceived", ERROR_NO_RESPONSE_VKAPI, data);
				return;
			};

			s.params = data.response;
			s.request();

		});
	},

	setLast: function () {
		this.last = parseInt(Date.now() / 1000);
	},

	/**
	 * Запрос к LongPoll для получения новых событий
	 */
	request: function () {
		var s = this;
		this.setLast();
		new RequestTask("https://" + s.params.server + "?act=a_check&key=" + s.params.key + "&ts=" + s.params.ts + "&wait=25&mode=66")
			.setOnComplete(function (result) {

				s.params.ts = result.result.ts;
				s.request();
				s.sendEvents(result.result.updates);

			})
			.setOnError(function (event) {

				s.sendError("onLongPollConnectionError", ERROR_WHILE_REQUEST_LONGPOLL, event);
				s.getServer();

			})
			.post();
	},

	/**
	 * Отправка событий на сайт
	 */
	sendEvents: function (items) {
		var context = this;
		this.workers.forEach(function (worker) {
			try {
				worker.port.emit("onLongPollDataReceived", {
					updates: items
				});
			} catch (e) {
				context.detach(worker);
			};
		});
	},

	/**
	 * Отправка событий на сайт
	 */
	sendError: function (method, errorId, event) {
		this.workers.forEach(function (worker) {
			try {
				worker.port.emit(method, {
					errorId: errorId,
					error: event
				});
			} catch (e) {
				context.detach(worker);
			};
		});
	},

	detach: function (worker) {
		console.error("WORKER DETACHING");
		var index = this.workers.indexOf(worker);
		if (index < 0) {
			return;
		};
		console.error("WORKER WAS DETACHED");
		this.workers.splice(index, 1);
		worker = null;
	}
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