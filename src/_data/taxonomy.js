const { loadYaml } = require("../lib/config");
module.exports = () => loadYaml("config/content.yml");
