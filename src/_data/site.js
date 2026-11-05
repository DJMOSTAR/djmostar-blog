const { loadYaml } = require("../lib/config");
module.exports = () => loadYaml("config/site.yml");
