// bdd-standard v1, кастомное правило gherkin-lint:
// каждый сценарий обязан иметь тег области @logic или @e2e.
// Причина: от тега зависит профиль прогона (logic — движок без браузера,
// e2e — живой стенд) и группировка в отчёте. Штатный required-tags не
// подходит: он требует ВСЕ теги списка и молчит на нетегированных.
const gherkinUtils = require('@onitofu/gherkin-lint/src/rules/utils/gherkin.js');

const rule = 'require-scope-tag';
const availableConfigs = { tags: ['@logic', '@e2e'] };

function run(feature, unused, configuration) {
  if (!feature) {
    return [];
  }
  const required = (configuration && configuration.tags) || availableConfigs.tags;
  const errors = [];
  // теги Feature наследуются всеми сценариями (как и в раннерах)
  const featureTags = (feature.tags || []).map(t => t.name);
  (feature.children || []).forEach(child => {
    const node = child.rule || child.background || child.scenario;
    if (!node) {
      return;
    }
    const nodeType = gherkinUtils.getNodeType(node, feature.language);
    if (nodeType !== 'Scenario' && nodeType !== 'Scenario Outline') {
      return;
    }
    const names = featureTags.concat((node.tags || []).map(t => t.name));
    if (!required.some(tag => names.includes(tag))) {
      errors.push({
        message: 'Scenario missing scope tag: need one of ' + required.join(' '),
        rule: rule,
        line: (node.location && node.location.line) || 0
      });
    }
  });
  return errors;
}

module.exports = { name: rule, run: run, availableConfigs: availableConfigs };
