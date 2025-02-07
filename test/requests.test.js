/* jshint node: true */
var expect = require('chai').expect;
var sinon = require('sinon');

describe('Main App Functionality', function () {
    //it('should reject invalid AppID', function () {
    //    var request = require('./LaunchRequestInvalidApp.json');
    //    // TODO reject invalid AppID
    //});
});

describe('Requests', function() {
    require('./plex-api-stubs.helper.js').plexAPIStubs();

    beforeEach(function() {
        // Yes this is slow but hey it's just tests?
        this.request = JSON.parse(JSON.stringify(require('./RequestTemplate.json')));
    });

    describe('Launch', function () {

        it('should prompt for a command', function (done) {
            this.request.request.type = 'LaunchRequest';
            this.request.request.intent = null;

            this.lambda.handler(this.request, {
                succeed: function (res) {
                    expect(res).to.have.deep.property('response.shouldEndSession').that.is.false;
                    expect(res).to.not.have.deep.property('response.card');
                    expect(res).to.have.deep.property('response.outputSpeech.text').that.matches(/plex is listening/i);
                    done();
                }, fail: function (res) {
                    console.log(res);
                    expect.fail();
                    done();
                }
            });
        });
    });

    describe('Intents', function () {

        beforeEach(function() {
            this.request.request.type = 'IntentRequest';
        });

        describe('OnDeckIntent', function() {
            beforeEach(function() {
                this.request.request.intent.name = 'OnDeckIntent';
            });

            it('should respond with shows that are On Deck', function (done) {
                this.plexAPIStubs.query.withArgs('/library/onDeck').resolves(require('./samples/library_onDeck.json'));

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.have.deep.property('response.card.subtitle')
                            .that.matches(/on deck/i);
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/penny-dreadful.*game-of-thrones.*brooklyn-nine-nine/i);
                        expect(self.plexAPIStubs.query).to.have.been.calledOnce;
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it('should handle a response with zero shows', function (done) {
                this.plexAPIStubs.query.withArgs('/library/onDeck').resolves(function(){
                    var response = JSON.parse(JSON.stringify(require('./samples/library_onDeck.json')));
                    response._children = [];
                    return response;
                }());

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.not.have.deep.property('response.card');
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/do not have any shows/i);
                        expect(self.plexAPIStubs.query).to.have.been.calledOnce;
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it('should handle an error from the Plex API', function (done) {
                this.plexAPIStubs.query.withArgs('/library/onDeck').rejects(new Error("Stub error from Plex API"));

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.not.have.deep.property('response.card');
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/sorry/i);
                        expect(self.plexAPIStubs.query).to.have.been.calledOnce;
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });
        });

        describe('StartShowIntent', function() {
            beforeEach(function() {
                this.request.request.intent.name = 'StartShowIntent';
            });

            beforeEach('set up plex-api stub responses', function(){
                this.plexAPIStubs.query.withArgs('/').resolves(require('./samples/root.json'));
                this.plexAPIStubs.query.withArgs(sinon.match(/\/library\/metadata\/[0-9]+$/))
                    .resolves(require('./samples/library_metadata_item.json'));
                this.plexAPIStubs.query.withArgs('/library/sections/1/all')
                    .resolves(require('./samples/library_section_allshows.json'));
                this.plexAPIStubs.query.withArgs('/library/metadata/1/allLeaves')
                    .resolves(require('./samples/library_metadata_showepisodes_withunwatched.json'));
                this.plexAPIStubs.query.withArgs('/library/metadata/143/allLeaves')
                    .resolves(require('./samples/library_metadata_showepisodes_allwatched.json'));

                this.plexAPIStubs.postQuery.withArgs(sinon.match(/\/playQueues/))
                    .resolves(require('./samples/playqueues.json'));

                this.plexAPIStubs.perform.withArgs(sinon.match(/\/playMedia/))
                    .resolves();

                this.plexAPIStubs.find.withArgs('/clients')
                    .resolves(require('./samples/clients.json'));
            });

            it('should play a random episode if they\'ve all been watched', function (done) {
                this.request.request.intent.slots.showName = {name: 'showName', value: "a show I've finished watching"};

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.have.deep.property('response.card.subtitle')
                            .that.matches(/Playing Random Episode/i);
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/enjoy this episode from season/i);
                        expect(self.plexAPIStubs.perform).to.have.been.calledWithMatch(/playMedia/i);
                        expect(self.plexAPIStubs.postQuery).to.have.been.calledWithMatch(/playQueues/i);
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it('should play the next episode if there are any unwatched ones', function (done) {
                this.request.request.intent.slots.showName = {name: 'showName', value: 'a show with unwatched episodes'};

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        console.log(res);
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.have.deep.property('response.card.subtitle')
                            .that.matches(/Playing Next Episode/i);
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/next episode/i);
                        expect(self.plexAPIStubs.perform).to.have.been.calledWithMatch(/playMedia/i);
                        expect(self.plexAPIStubs.postQuery).to.have.been.calledWithMatch(/playQueues/i);
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it('should be able to find the next episode even if the array is out of order', function (done) {
                this.request.request.intent.slots.showName = {name: 'showName', value: 'a show with unwatched episodes'};

                this.plexAPIStubs.query.withArgs('/library/metadata/1/allLeaves')
                    .resolves(function(){
                        var result = JSON.parse(JSON.stringify(require('./samples/library_metadata_showepisodes_withunwatched.json')));
                        result._children.reverse();
                        return result;
                    }());

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        console.log(res);
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.have.deep.property('response.card.subtitle')
                            .that.matches(/Playing Next Episode/i);
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/next episode.*Resurrection/i);
                        expect(self.plexAPIStubs.perform).to.have.been.calledWithMatch(/playMedia/i);
                        expect(self.plexAPIStubs.postQuery).to.have.been.calledWithMatch(/playQueues/i);
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it('should gracefully fail if the show name is not found', function (done) {
                this.request.request.intent.slots.showName = {name: 'showName', value: 'q'};

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        //console.log(res);
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.not.have.deep.property('response.card');
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/I couldn't find that show in your library/i);
                        expect(self.plexAPIStubs.perform).to.not.have.been.calledWithMatch(/playMedia/i);
                        expect(self.plexAPIStubs.postQuery).to.not.have.been.calledWithMatch(/playQueues/i);
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it('should handle an error on query for all show names', function (done) {
                this.request.request.intent.slots.showName = {name: 'showName', value: "a show I've finished watching"};

                this.plexAPIStubs.query.withArgs('/library/sections/1/all')
                    .rejects(new Error("Stub error from Plex API"));

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        console.log(res);
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.not.have.deep.property('response.card');
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/sorry/i);
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it('should handle an error on query for all episodes of a show', function (done) {
                this.request.request.intent.slots.showName = {name: 'showName', value: "A show that will cause an error"};

                this.plexAPIStubs.query.withArgs('/library/metadata/3754/allLeaves')
                    .rejects(new Error("Stub error from Plex API"));

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        console.log(res);
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.not.have.deep.property('response.card');
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/sorry/i);
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it("should throw an error if it can't find an unwatched episode", function (done) {
                this.request.request.intent.slots.showName = {name: 'showName', value: 'a show with unwatched episodes'};

                this.plexAPIStubs.query.withArgs('/library/metadata/1/allLeaves')
                    .resolves(require('./samples/library_metadata_showepisodes_allwatched.json'));

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        console.log(res);
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.not.have.deep.property('response.card');
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/sorry/i);
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });

            it("Should complain if no show name was provided", function (done) {
                this.request.request.intent.slots = {};

                this.plexAPIStubs.query.withArgs('/library/metadata/1/allLeaves')
                    .resolves(require('./samples/library_metadata_showepisodes_allwatched.json'));

                var self = this;
                this.lambda.handler(this.request, {
                    succeed: function(res) {
                        console.log(res);
                        expect(res.response.shouldEndSession).to.be.true;
                        expect(res).to.not.have.deep.property('response.card');
                        expect(res).to.have.deep.property('response.outputSpeech.text')
                            .that.matches(/No show specified/i);
                        done();
                    }, fail: function(res) {
                        console.log(res);
                        done(Error('Lambda returned fail()'));
                    }
                });
            });
        });
    });
});




