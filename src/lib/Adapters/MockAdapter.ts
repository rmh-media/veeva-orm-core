import { Operator } from '../Queries/QueryWithWhereClause'

import { AdapterQuery, QueryType, Term } from './AdapterQuery'
import AdapterResult from './AdapterResult'
import IAdapter from './IAdapter'

function termMatches (term: Term, item: any): boolean {
  if (!Object.hasOwnProperty.call(item, term.field)) {
    throw new Error(`Object does not have the property ${term.field}`)
  }

  const val = item[term.field]

  if (term.operator === Operator.EQUALS) {
    return val == term.value
  } else if (term.operator === Operator.LIKE) {
    return (new RegExp('.+', 'i')).test(val)
  } else if (term.operator === Operator.IN) {
    return term.value.includes(val)
  }

  return false
}

function filter (termGroups: Term[][]): (item: any) => boolean {
  return (item: any) => {
    for (let i = 0; i < termGroups.length; i++) {
      let matchesGroup = true

      for (let j = 0; j < termGroups[i].length; j++) {
        const term = termGroups[i][j]

        if (!termMatches(term, item)) {
          // the term does not match and we can skip execution of this
          // group as all terms are ANDed
          matchesGroup = false
          break
        }
      }

      if (matchesGroup) {
        // the term matches the group, all groups are ORed so we can
        // skip further execution and return a true for a match
        return true
      }
    }

    return false
  }
}

function project (fields: string[]): (item: any) => any {
  return item => {
    const data = {}

    fields.forEach(fieldName => {
      data[fieldName] = item[fieldName]
    })

    return data
  }
}

export default class MockAdapter implements IAdapter {
  private _objects = new Map<string, any[]>()
  private _defaults = new Map<string, string>()
  private _schemas = new Map<string, string[]>()

  fill (object: string, items: any[]): this {
    this._objects.set(object, items)
    if (items.length > 0) {
      this._schemas.set(object, Object.keys(items[0]))
    }

    console.debug(`Set ${object} with ${items.length} items`)

    return this
  }

  setDefaultId (object: string, id: string): this {
    this._defaults.set(object, id)

    return this
  }

  runQuery (query: AdapterQuery): Promise<AdapterResult> {
    if (query.type === QueryType.SELECT) {
      return this.runSelectQuery(query)
    } else if (query.type === QueryType.SELECT_CURRENT) {
      return this.runSelectCurrentQuery(query)
    }

    throw new Error('Query Type not supported')
  }

  private validateQuery (query: AdapterQuery) {
    if (!this._objects.has(query.object)) {
      throw new Error(`Object ${query.object} was not filled`)
    }

    if (!this._schemas.has(query.object)) {
      console.warn(`No objects set for object '${query.object}' – could not validate schema`)
      return
    }

    const unmatchedField = query.fields.find((field) => {
      return !this._schemas.get(query.object)!.includes(field)
    })

    if (unmatchedField) {
      throw new Error(`Object '${query.object} does not have a field named '${unmatchedField}'`)
    }
  }

  private runSelectQuery (query: AdapterQuery): Promise<AdapterResult> {
    this.validateQuery(query)

    const objects = this._objects.get(query.object)!
      .filter(filter(query.where))
      .map(project(query.fields))

    return Promise.resolve({
      success: true,
      objects
    })
  }

  private runSelectCurrentQuery (query: AdapterQuery): Promise<AdapterResult> {
    if (!this._objects.has(query.object)) {
      return Promise.reject(new Error(`Object ${query.object} was not filled`))
    }

    if (!this._defaults.has(query.object)) {
      return Promise.resolve({
        success: true,
        objects: []
      })
    }

    const objects = this._objects.get(query.object)!
      .filter((item) => {
        return item.Id === this._defaults.get(query.object)
      })
      .map(project(query.fields))

    return Promise.resolve({
      success: true,
      objects
    })
  }
}
