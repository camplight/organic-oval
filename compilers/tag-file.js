const matchScript = function (line) {
  return line.indexOf('<script') !== -1
}
const extractScriptContent = function (lines) {
  let buffer = []
  let inScriptBlock = false
  for (let i = 0; i < lines.length; i++) {
    if (matchScript(lines[i])) {
      inScriptBlock = true
      lines.splice(i, 1)
      i -= 1
      continue
    }
    if (inScriptBlock && lines[i].indexOf('</script>') !== -1) {
      lines.splice(i, 1)
      return buffer.join('\n')
    }
    if (inScriptBlock) {
      buffer.push(lines[i])
      lines.splice(i, 1)
      i -= 1
      continue
    }
  }
}

const extractTagInfo = function (lines) {
  var firstLine = lines[0]
  var tagName = firstLine.split(' ')[0].replace('<', '').replace('>', '')
  var tagLine = firstLine.replace('<' + tagName, '').replace('>', '')
  lines.shift()
  lines.pop()
  return {tagName, tagLine}
}

const parseLoops = function (lines) {
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('<each ') !== -1) {
      let openingTag = lines[i].trim().slice('<each'.length, -1)
      let params = openingTag.split(' in ')[0].trim()
      let model = openingTag.split(' in ')[1].trim().slice('{'.length, -1) // get the model, removing ${ and }
      lines[i] = `{ ${model}.map((${params}) => `
    }
    if (lines[i].indexOf('</each>') !== -1) {
      lines[i] = lines[i].replace('</each>', ')}')
    }
  }
}

const extractStatement = function (line) {
  // line example: 'class="something" if={statement} id="1"'
  // output: 'statement'
  var ifMark = 'if={'
  // find index of if mark
  var statementStart = line.indexOf(ifMark)
  // find index of end statement
  var statementEnd = -1
  var bcount = 1
  for (var i = statementStart + ifMark.length; i < line.length; i++) {
    if (line.charAt(i) === '{') bcount += 1
    if (line.charAt(i) === '}') bcount -= 1
    if (bcount === 0) {
      statementEnd = i
      break
    }
  }
  // return statement substring without ifMark and closing bracket
  var statement = line.substring(statementStart + ifMark.length, statementEnd)
  return statement
}
const extractAttributes = function (condition, line) {
  return line.replace('if={' + condition + '}', '')
}
const parseIfs = function (lines) {
  // variable holding amount of `if` statements encountered during parsing
  // used to construct `oid` value
  let ifcount = -1

  // iterate over all lines searching for if statements
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('if=') !== -1) {
      ifcount += 1
      lines[i] = lines[i].trim()

      // test transform multiline if statement such as
      // <p if=${}
      //    class="">...
      // into singleline <p if=${} class="">...
      var closingArrowIndex = lines[i].lastIndexOf('>')
      if (closingArrowIndex !== lines[i].length - 1) {
        var lineBuffer = []
        for (var j = i + 1; j < lines.length; j++) {
          if (lines[j].indexOf('>') === -1) {
            lineBuffer.push(lines[j].trim())
            lines.splice(j, 1)
            j -= 1
          } else {
            lineBuffer.push(lines[j].trim())
            lines.splice(j, 1)
            j -= 1
            break
          }
        }
        lines[i] += ' ' + lineBuffer.join('')
      }

      // get the opening tag, remove '<' and '>'
      var line = lines[i].trim().slice(1, -1)
      // split the line, the first element is the node name, the others are attributes
      // example: span class="something" if={condition} id="1" -> ['span', 'class="something"', 'if={condition}', 'id="1"']
      var parsedLine = line.split(' ')

      // get the node name
      var nodeName = parsedLine.shift()
      parsedLine = parsedLine.join(' ')
      var statement = extractStatement(parsedLine)
      var attributes = extractAttributes(statement, parsedLine)

      let openBr = '{'
      let closeBr = '}'

      if (lines[i].indexOf('/>') === -1 && lines[i].indexOf('</' + nodeName + '>') === -1) {
        // buffer lines between start and end closing tag when not on the same line
        var buffer = []
        var innerNodeNameCount = 0

        for (var k = i + 1; k < lines.length; k++) {
          // found a line with the same node name as the opening tag
          if (lines[k].indexOf('<' + nodeName) !== -1) {
            innerNodeNameCount += 1
          }
          // found a line with a name of the closing tag
          if (lines[k].indexOf('</' + nodeName + '>') !== -1) {
            if (innerNodeNameCount > 0) {
              // the line has closing tag of a inner childrens
              innerNodeNameCount -= 1
            } else {
              // the line is the closing tag of the statement
              lines.splice(k, 1)
              break
            }
          }
          // buffer lines and remove them from original source
          buffer.push(lines[k].trim())
          lines.splice(k, 1)
          k -= 1
        }
        // re-construct attributes with oid marker included
        if (attributes.indexOf('key=') === -1) {
          attributes = 'key={this.oid + "-if' + ifcount + '"} ' + attributes
        }
        // rewrite opening tag with if statement
        lines[i] = openBr + statement + ' ? <' + nodeName + ' ' + attributes + '>'
        // insert any buffered content at next line of `i + k`
        for (let k = 0; k < buffer.length; k++) {
          lines.splice(i + k + 1, 0, buffer[k])
        }
        // insert closing tag
        lines.splice(i + buffer.length + 1, 0, '</' + nodeName + '> : ""' + closeBr)
      } else {
        // single line if statement such as `<p if=${statement}>text</p>``

        // get clean tag
        var lineWithoutStatement = lines[i].replace('if={' + statement + '}', '')

        // re-construct attributes with oid marker
        let parts = lineWithoutStatement.trim().split(' ')
        if (lineWithoutStatement.indexOf('key') === -1) {
          parts.splice(1, 0, 'key={this.oid + "-if' + ifcount + '"}')
        }
        lineWithoutStatement = parts.join(' ')

        // rewrite the line
        lines[i] = openBr + statement + ' ? ' + lineWithoutStatement + ' : "" ' + closeBr
      }
    }
  }
}

const escapeTagline = function (value) {
  return value.replace(/"/g, '\\"')
}

module.exports.compile = function (content) {
  let lines = content.trim().split('\n')
  let scriptContent = extractScriptContent(lines) || ''
  let tagInfo = extractTagInfo(lines)
  parseIfs(lines)
  parseLoops(lines)
  let htmlContent = '<>' + lines.join('\n').trim() + '</>'
  let result = `
  /** @jsx createElement */
  /** @jsxFrag Fragment */

  module.exports = require('organic-oval').define({
    tagName: "${tagInfo.tagName}",
    tagLine: "${escapeTagline(tagInfo.tagLine)}",
    onconstruct: function () {

      ${scriptContent.trim()}

      this.template = function (Fragment, props, state) {
        let createElement = this.createElement
        return ${htmlContent}
      }
    }
  })
`
  return result
}
