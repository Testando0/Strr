const FormData = require("form-data");
const FileType = require("file-type");
const axios = require("axios");

class Uploader {
  getRandomFilename(extension) {
    return `${Math.floor(Math.random() * 10000)}.${extension}`;
  }

  fakeUserAgent() {
    const agents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)"
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  async catbox(content) {
    try {
      let ext = "png";
      try {
        const type = await FileType.fromBuffer(content);
        if (type && type.ext) ext = type.ext;
      } catch (e) {}

      const formData = new FormData();
      formData.append("reqtype", "fileupload");
      formData.append("fileToUpload", content, this.getRandomFilename(ext));

      const response = await axios.post(
        "https://catbox.moe/user/api.php",
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            "User-Agent": this.fakeUserAgent()
          }
        }
      );

      return response.data;
    } catch (err) {
      throw new Error(`Erro ao enviar para Catbox: ${err.message}`);
    }
  }
}

module.exports = Uploader;
