/**
 * Кроссбраузерная библиотека для удобного использования API расширений для Gecko/Webkit одновременно
 * Version 1.0: 25 марта 2016 г.
 */

var
	EXTENSION_VERSION = 2.0,
	EXTENSION_AGENT = "firefox",

	METHOD_ACCESS_TOKEN_REQUIRE = "onAccessTokenRequire",
	METHOD_LONGPOLL_DATA_RECEIVED = "onLongPollDataReceived",
	METHOD_LONGPOLL_CONNECTION_ERROR = "onLongPollConnectionError",
	METHOD_EXECUTE_API_REQUESTED = "onAPIRequestExecuted",
	METHOD_FILE_UPLOADED = "onFileUploaded",
	METHOD_FILE_UPLOAD_PROGRESS = "onFileUploading",
	IMETHOD_FILE_UPLOAD_READ = "onFileReceivedToWorker",

	EVENT_ACCESS_TOKEN_RECEIVED = "onAccessTokenReceived",
	EVENT_EXECUTE_API_REQUEST = "onAPIRequestExecute",
	EVENT_FILE_UPLOAD_REQUEST = "onFileUploadRequest",

	ERROR_NO_RESPONSE_VKAPI = 1,
	ERROR_WHILE_REQUEST_LONGPOLL = 2;

/**
 * Отправляет событие из расширения на страницу
 */
function sendEvent (method, data, callback) {
	data.method = method;
	data.callback = callback;
	data.version = EXTENSION_VERSION;
	data.agent = EXTENSION_AGENT;
	window.postMessage(data, "https://apidog.ru/");
};

/**
 * Функция-распределитель событий
 */
function receiveEvent (method, data) {
	switch (method) {

		case EVENT_ACCESS_TOKEN_RECEIVED:
			self.port.emit("onAccessTokenReceived", data);
			APIdog.userAgent = data.userAgent;
			break;

		case EVENT_EXECUTE_API_REQUEST:
			self.port.emit("onAPIRequestExecute", data);
			break;

		case EVENT_FILE_UPLOAD_REQUEST:

			if (data.source === "clipboard") {
				data.file = require("sdk/clipboard").get("image");
				if (!data.file) {
					return;
				};

				data.file = base64ToBlob(data.file);
			};

			//self.port.emit("onFileUploadRequest", {  })
			break;
	};
};

self.port.on("onAPIRequestExecuted", function(event) {
	sendEvent("onAPIRequestExecuted", {
		requestId: event.requestId,
		requestResult: event.requestResult
	});
});
self.port.on("onLongPollDataReceived", function(event) {
	sendEvent("onLongPollDataReceived", event);
});

var APIdog = {

	userAgent: "VKAndroidApp/4.38-816 (Android 6.0; SDK 23; x86;  Google Nexus 5X; ru)"

};

/**
 * Обработчик нового события
 */
window.addEventListener("message", function (event) {

	if (event.data.version) {
		return;
	};

	if (event.data.method) {
		receiveEvent(event.data.method, event.data);
	};

});

/**
 * Запрос токена со страницы для инициализации расширения
 */
sendEvent(METHOD_ACCESS_TOKEN_REQUIRE, {}, EVENT_ACCESS_TOKEN_RECEIVED);


function base64ToBlob(b64Data, contentType) {
  contentType = contentType || 'image/jpg';

  var byteCharacters = atob(b64Data);
  var byteArrays = [];

  for (var offset = 0; offset < byteCharacters.length; offset += 512) {
    var slice = byteCharacters.slice(offset, offset + 512);

    var byteNumbers = new Array(slice.length);
    for (var i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    var byteArray = new Uint8Array(byteNumbers);

    byteArrays.push(byteArray);
  }

  var blob = new Blob(byteArrays, {type: contentType});
  return blob;
}