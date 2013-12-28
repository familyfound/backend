
var getDb = require('./db')
  , config = require('config')
  , Crawler = require('crawler')

// getcrawler
module.exports = function (token, done) {
  var FS = fs.single()
  MongoClient.connect(config.mongo, function (err, db) {
    if (err) return done(err)
    var cached = FS.cached.bind(FS, db.collection('fs-cached'))
      , crawler = makeCrawler(token, cached, db)
    done(null, crawler)
  })
}

function makeCrawler(token, cached, db) {
  return new Crawler(token, {
    get: {
      rels: function (id, done) {
        cached('persons-with-relationships', {
          person: id
        }, token, function (err, data) {
          if (err) return done(err)
          done(null, parseRelations(id, data))
        })
      },
      more: function (id, done) {
        async.parallel({
          sources: function (next) {
            cached('person-source-references-template', {
              pid: id
            }, token, function (err, data) {
              if (err) return done(err)
              next(null, parseSources(id, data))
            })
          },
          duplicates: function (next) {
            cached('person-matches-template', {
              pid: id
            }, token, function (err, data) {
              next(null, parseDuplicates(id, data))
            })
          }
        }, done)
      },
      data: function (id, done) {
        db.collection('people').findOne({
          id: id
        }, done)
      },
      history: function (id, done) {
        db.collection('history').find({
          id: id,
        }, {
          sort: 'modified'
        }).toArray(done)
      },
      recent_people: function (id, done) {
        done(new Error('recent people not implemented'))
      }
    },
    saveTodos: function (id, todos, done) {
      db.collection('people').update({
        id: id
      }, {
        $set: {todos: todos, id: id}
      }, {upsert: true}, function () {
        done && done()
      })
    }
  })
}

function agespan(lifespan) {
  var parts = lifespan.split('-')
    , born = parseInt(parts[0], 10)
    , died = parseInt(parts[1], 10)
  if (isNaN(born) || isNaN(died)) return undefined
  return died - born
}

// what do I want?
// - display
// - parents [list of ids]
// - mother: id
// - father: id
// - families: {
//     spouseid: [childid, childid, childid],
//     ...
//   }
//
// b/c
// relationships
//   - http://gedcomx.org/Couple, person1.resourceId, person2.resourceId
//   - http://gedcomx.org/ParentChild
//     - parent: person1.resourceId
//     - child:  person2.resourceId
// childAndParentsRelationships
//   - father, mother, child
//
function parseRelations(id, data) {
  var person = data.persons[0].display
    , ids = []
    , results = {
        display: data.persons[0].display,
        multipleParents: false,
        parents: [],
        children: [],
        spouses: [],
        mother: null,
        father: null,
        families: {}
      }
  if (person.display.lifespan) {
    person.display.age = agespan(person.display.lifespan)
  }
  var families = {};
  if (data.childAndParentsRelationships) {
    data.childAndParentsRelationships.forEach(function (rel) {
      if (rel.child && rel.child.resourceId === person.id) {
        if (rel.father && rel.father.resourceId) {
          if (person.father) person.multipleParents = true;
          person.father = rel.father.resourceId;
          person.parents.push(person.father)
          ids.push(person.father)
        }
        if (rel.mother && rel.mother.resourceId) {
          if (person.mother) person.multipleParents = true;
          person.mother = rel.mother.resourceId;
          person.parents.push(person.mother)
          ids.push(person.mother)
        }
        return
      }
      var spouseId;
      if (rel.father && rel.father.resourceId !== person.id) {
        spouseId = rel.father.resourceId;
      } else if (rel.mother && rel.mother.resourceId !== person.id) {
        spouseId = rel.mother.resourceId;
      }
      ids.push(spouseId)
      person.spouses.push(spouseId)
      if (!families[spouseId]) families[spouseId] = [spouseId];
      if (rel.child) {
        person.children.push(rel.child)
        families[spouseId].push(rel.child.resourceId);
        ids.push(rel.child.resourceId)
      }
    });
  }
  if (data.relationships) {
    data.relationships.forEach(function (rel) {
      if (rel.type === 'http://gedcomx.org/ParentChild') {
        if (rel.person1.resourceId === id) {
          if (ids.indexOf(rel.person2.resourceId) === -1) {
            if (!person.families.unknown) person.families.unknown = []
            person.families.unknown.push(rel.person2.resourceId)
            person.children.push(rel.person2.resourceId)
          }
        } else if (ids.indexOf(rel.person1.resourceId) === -1) {
          person.parents.push(rel.person1.resourceId)
        }
      } else if (rel.type === 'http://gedcomx.org/Couple') {
        var spouseId
        if (rel.person1.resourceId === id) {
          spouseId = rel.person2.resourceId
        } else {
          spouseId = rel.person1.resourceId
        }
        if (!person.families[spouseId]) {
          person.families[spouseId] = [spouseId]
          person.spouses.push(spouseId)
        }
      }
    })
  }
  person.families = families;
  return person;
}

function parseSources(data) {
  return data.persons[0].sources.map(function (source) {
    return source.description
  })
}

function parseDuplicates(data) {
  return data.entries.map(function (dup) {
    return {
      score: dup.score,
      title: dup.title
    }
  })
}

