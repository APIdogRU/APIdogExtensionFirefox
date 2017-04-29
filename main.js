var data = require("sdk/self").data,
	pageMod = require("sdk/page-mod"),
	request = require("sdk/request"),
	urls = require("sdk/url"),
	xhr = require("sdk/net/xhr"),

	inited = false;

const fileIO = require("sdk/io/byte-streams");

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

		worker.port.on("onFileUploadRequest", function (file) {
			//var f = fileIO.open(file.file, CREATE_FILE);
			file.file = urls.DataURL(file.file);
			console.error(file.file.data);
			new VKUpload(file).getServer();
		})
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
				result = result.result;

				if (result.failed) {
					return s.getServer();
				};

				s.params.ts = result.ts;
				s.request();
				s.sendEvents(result.updates);

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
		var context = this;
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
function RequestTask (url, params, options) {
	var context = this, headers = {
		"User-Agent": "VKAndroidApp/4.38-816 (Android 6.0; SDK 23; x86;  Google Nexus 5X; ru)"
	};
	options = options || {};

	if (options.headers) {
		for (var key in options.headers) {
			headers[key] = options.headers;
		};
	};

	this.xhr = request.Request({
		url: url,
		headers: headers,
		content: params,
		anonymous: true,
		onComplete: function (response) {
			console.error(response.text);
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

function VKUpload (options) {
	this.accessToken = options.accessToken;
	this.mGetServer = { method: options.getServerMethod, params: options.getServerParams, paramName: options.paramName, fileName: options.fileName };
	this.mFile = options.file;
	this.mSave = { method: options.saveMethod };
};
VKUpload.prototype = {

	getServer: function () {
		var params = this.mGetServer.params || {}, context = this;
		params.access_token = this.accessToken;
		API(this.mGetServer.method, params, function (result) {
			if (result.response) {
				context.mServer = result.response.upload_url;
console.error("GOT UPLOAD URL");
console.error(result);
				context.upload();
			}
		});
	},

	upload: function () {

		var request = new xhr.XMLHttpRequest(), fd = new FormData();
		request.open("POST", this.mServer, true);

		request.onloadend = function (event) {
			console.error(request.responseText)
			//var e = JSON.parse(request.responseText);
		};

		request.send(fd);


		var boundaryString = "uploadingfile",
			boundary = "-----------------------------" + boundaryString,
			requestbody = [];
		requestbody.push(boundary);
		requestbody.push("Content-Disposition: form-data; name=\"" + this.mGetServer.paramName + "\"; filename=\"" + this.mGetServer.fileName + "\"");
		requestbody.push("Content-Type: application/octet-stream");
		requestbody.push("");
		requestbody.push(this.mFile.data);
		requestbody.push("-----------------------------" + boundary+"--");
		requestbody = requestbody.join("\r\n");
		request.setRequestHeader("Content-type", "multipart/form-data; boundary=\"" + boundary + "\"");
		request.setRequestHeader("Connection", "close");
		request.setRequestHeader("Content-length", requestbody.length);

		request.send(requestbody);



/*


console.error(requestbody);
		var request = new RequestTask(this.mServer, requestbody, {
			"Content-type": "multipart/form-data; boundary=\"" + boundaryString + "\"",
			"Connection": "close",
			"Content-Length": requestbody.length
		})
			.setOnComplete(function (result) {
				if (result.isSuccess) {
					console.log("RESULT UPLOAD");
					console.error(result.result)
					callback(result.result);
				} else {
					console.error(result); // TODO: как-то реагировать на ошибку
				}
			})
			.post();*/
	}

};


!function(t){function n(){if(!(this instanceof n))return new n;this.boundary="------RWWorkerFormDataBoundary"+Math.random().toString(36);var t=this.data=[];this.__append=function(n){var e,r=0;if("string"==typeof n)for(e=n.length;e>r;++r)t.push(255&n.charCodeAt(r));else if(n&&n.byteLength){"byteOffset"in n||(n=new Uint8Array(n));for(e=n.byteLength;e>r;++r)t.push(255&n[r])}}}if(!t.FormData){t.FormData=n;var e=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(t){return t instanceof n&&(t.__endedMultipart||t.__append("--"+t.boundary+"--\r\n"),t.__endedMultipart=!0,this.setRequestHeader("Content-Type","multipart/form-data; boundary="+t.boundary),t=new Uint8Array(t.data)),e.call(this,t)},n.prototype.append=function(t,n,e){if(this.__endedMultipart&&(this.data.length-=this.boundary.length+6,this.__endedMultipart=!1),arguments.length<2)throw new SyntaxError("Not enough arguments");var r="--"+this.boundary+'\r\nContent-Disposition: form-data; name="'+t+'"';return n instanceof File||n instanceof Blob?this.append(t,new Uint8Array((new FileReaderSync).readAsArrayBuffer(n)),e||n.name):("number"==typeof n.byteLength?(r+='; filename="'+(e||"blob").replace(/"/g,"%22")+'"\r\n',r+="Content-Type: application/octet-stream\r\n\r\n",this.__append(r),this.__append(n),r="\r\n"):r+="\r\n\r\n"+n+"\r\n",void this.__append(r))}}}(this||self);