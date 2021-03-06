const oval = require('../index')

oval.define({
  tagName: 'tag-render-as',
  tagLine: '',
  onconstruct: function () {
    this.renderValue = '1'
    this.template = () => this.createElement('div', { 'class': this.renderValue })
  }
})

oval.define({
  tagName: 'tag-container',
  tagLine: '',
  onconstruct: function () {
    this.template = () => this.createElement('tag-render-as', {as: 'tr'})
  }
})

test('render-as', function () {
  var container = document.createElement('tag-container')
  document.body.appendChild(container)
  oval.upgrade(container)
  let el = container.children[0]
  var target = el.children[0]
  var renderValue = el.component.renderValue
  expect(target.attributes.class.value).toEqual(renderValue)
  expect(container.children[0].tagName).toEqual('TR')
})
