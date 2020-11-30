'use strict';

class App {
    constructor() {
        this.patient = new Patient(this);
        this.interface = new InfermedicaHandler(this);
        this.nav = new NavHandler(this);
        this.renderer = new PageRenderer(this);
        this.riskInterview = new RiskFactorInterviewHandler(this);
    }
}
'use strict';

class InfermedicaHandler {
    constructor(app) {
        this.app = app;
        this.url = 'https://api.infermedica.com/v2/';
        this.settings = {
            'beforeSend': function(xhr) {
                xhr.setRequestHeader('App-Id', '5bb26054');
                xhr.setRequestHeader('App-Key', '59538747c34765307c29023705344127');
                xhr.setRequestHeader('Dev-Mode', true);
            },
            'contentType': 'application/json',
            'error': function(XMLHttpRequest) {
                this.app.nav.catchError();
            }.bind(this)
        };
    }

    call(endpoint, params) {
        this[endpoint](params);
    }

    search(params) {
        const url = this.url + 'search';
        const settings = Object.assign(this.settings);
        settings.data = {
            'phrase': params.phrase,
        };
        settings.method = 'GET';
        settings.success = function(data) {
            this.processSearch(data, params);
        }.bind(this);
        $.ajax(url, settings);
    }

    processSearch(data, params) {
        this.app.patient.searchResults.push({ data, params });
        if (params.last) {
            this.app.patient.processSearchFinished();
        }
    }

    parse(params) {
        const url = this.url + 'parse';
        const settings = Object.assign(this.settings);
        settings.data = JSON.stringify({
            'text': params.phrase
        });
        settings.method = 'POST';
        settings.success = function(data) {
            this.processParse(data, params);
        }.bind(this);
        $.ajax(url, settings);
    }

    processParse(data, params) {
        const found = data.mentions;
        if (found.length === 0) {
            this.app.nav.noSymptomsFound(params.phrase);
        } else {
            for (let i = 0; i < found.length; i++) {
                let newParams = {
                    'phrase': found[i]['common_name'],
                    'parseData': found[i]
                };
                if (i === found.length - 1) {
                    newParams.last = true;
                }
                this.call('search', newParams);
            }
        }
    }

    diagnosis() {
        const url = this.url + 'diagnosis';
        const settings = Object.assign(this.settings);
        settings.data = JSON.stringify(this.app.patient.interview);
        settings.method = 'POST';
        settings.success = function(data) {
            this.app.patient.processDiagnosisData(data);
        }.bind(this);
        $.ajax(url, settings);
    }

    conditions(id, probability) {
        const url = this.url + 'conditions/' + id;
        const settings = Object.assign(this.settings);
        settings.method = 'GET';
        settings.success = function(data) {
            data.probability = probability;
            this.app.patient.conditions.push(data);
        }.bind(this);
        return $.ajax(url, settings);
    }
}
'use strict';

class NavHandler {
    constructor(app) {
        this.app = app;
    }

    run(e) {
        const id = $(event.target).data('clickable');;
        this[id]();
    }

    diagnoseMe() {
        this.app.renderer.run('header', 'header-disclaimer');
        this.app.renderer.run('main', 'disclaimer');
    }

    acceptDisclaimer() {
        this.app.renderer.run('header', 'header-symptomChecker');
        this.app.renderer.run('main', 'interview-start');
        this.app.renderer.run('footer', 'footer');
        $('footer').removeClass('hide');
        $('.footer').removeClass('hide');
    }

    submitInterviewStart() {
        const validator = $('form').validate({
            errorLabelContainer: '#errors',
            errorElement: 'li',
            messages: {
                'first-name': {
                    required: 'Please enter your name.',
                    minlength: 'Name must be at least 2 characters.'
                },
                'age': {
                    required: 'Please enter your age.'
                },
                'gender': {
                    required: 'Please select your gender.'
                }
            }
        });
        if (validator.form()) {
            this.app.patient.initialize(
                $('input[name=first-name]').val(),
                $('input[name=age]').val(),
                $('input[name=gender]:checked').val()
            );
            this.app.renderer.run('main', 'symptom-interview', this.app.patient);
        }
    }

    submitSymptoms() {
        const validator = $('form').validate({
            errorLabelContainer: '#errors',
            errorElement: 'li',
            messages: {
                'enter-symptoms': {
                    required: 'Enter your symptoms here.'
                }
            }
        });
        if (validator.form()) {
            const symptoms = $('textarea').val();
            this.app.renderer.run('main', 'loader', this.app.patient);
            this.app.interface.call('parse', { 'phrase': symptoms, 'patient': this.app.patient });
        }
    }

    submitSymptomMatcher() {
        const validator = $('form').validate({
            errorLabelContainer: '#errors',
            errorElement: 'li',
            rules: {
                'symptom': {
                    require_from_group: [1, ".symptom-group"]
                }
            },
            messages: {
                'symptom': {
                    require_from_group: 'Please select one or more of the following symptoms.'
                }
            }
        });
        if (validator.form()) {
            this.app.patient.processMatchedSymptoms();
        }
    }

    startSymptomMatcher() {
        const results = this.app.patient.searchResults.shift();
        this.app.renderer.run('main', 'symptom-matcher', results);
    }

    riskFactorStart() {
        this.app.renderer.run('main', 'risk-factor-intro', this.app.patient);
    }

    runRiskFactorInterview() {
        this.app.riskInterview.run();
    }

    submitRiskFactors() {
        const validator = $('form').validate({
            errorLabelContainer: '#errors',
            errorElement: 'li',
            rules: {
                'choice': {
                    require_from_group: [1, ".risk-factor-group"]
                }
            },
            messages: {
                'choice': {
                    require_from_group: 'If none of the statements apply to you, please select "None".'
                }
            }
        });
        if (validator.form()) {
            this.app.riskInterview.processInterviewAnswers();
        }
    }

    riskFactorInterviewComplete() {
        this.runDiagnosis();
    }

    runDiagnosis() {
        this.app.renderer.run('main', 'loader');
        this.app.interface.diagnosis();
    }

    showDiagnoses() {
        const wrapper = { 'conditions': this.app.patient.conditions };
        this.app.renderer.run('main', 'show-conditions', wrapper);
    }

    submitQuestionAnswer() {
        const validator = $('form').validate({
            errorLabelContainer: '#errors',
            errorElement: 'li',
            rules: {
                'choice': {
                    require_from_group: [1, ".choice-group"]
                }
            },
            messages: {
                'choice': {
                    require_from_group: 'Please select an answer, or select "None" if none of the statements apply to you.'
                }
            }
        });
        if (validator.form()) {
            this.app.patient.processQuestionAnswer();
        }
    }

    startOver() {
        location.reload(true);
    }

    catchError() {
        this.app.renderer.run('main', 'error');
    }

    noSymptomsFound(phrase) {
        this.app.renderer.run('main', 'symptom-interview', this.app.patient);
        $('#errors').removeAttr('style').html('<p class="error">No information found for: "' + phrase + '".  Please try again.');
    }

    symptomsTryAgain(phrase) {
        this.app.renderer.run('main', 'symptom-interview', this.app.patient);
    }
}
'use strict';

class PageRenderer {
    run(selector, name, data = {}) {
        const template = Handlebars.partials[name];
        $(selector).html(template(data)).attr('class', 'container').addClass(name);
        //initialize Materialize JS features
        M.AutoInit();
    }
}
'use strict';

class Patient {
    constructor(app) {
        this.app = app;
        this.interview = {
            'sex': null,
            'age': null,
            'evidence': []
        };
        this.presentEvidenceNames = [];
        this.absentEvidenceNames = [];
        this.searchResults = [];
        this.numCalls = 0;
        this.conditions = [];
    }

    initialize(name, age, gender) {
        this.name = name;
        this.interview.age = age;
        this.interview.sex = gender;
        this.processAge();
        this.processGender();
    }

    processAge() {
        if (this.interview.age < 18) {
            this.addEvidence('p_65', 'present', true);
        } else if (this.interview.age > 40) {
            this.addEvidence('p_3', 'present', true);

            if (this.interview.age >= 45 && this.interview.age <= 55) {
                this.addEvidence('p_4', 'present', true);
            } else if (this.interview.age > 60) {
                this.addEvidence('p_5', 'present', true);
            }
        }
    }

    processGender() {
        if (this.interview.sex === 'female') {
            this.addEvidence('p_1', 'present', true);
        } else {
            this.app.riskInterview.markInterviewUnavailable('femaleInterview');
            this.addEvidence('p_2', 'present', true);
        }
    }

    processSearchFinished() {
        if (this.searchResults !== undefined && this.searchResults.length != 0) {
            this.runSymptomMatcher();
        }
    }

    runSymptomMatcher() {
        this.app.nav.startSymptomMatcher();
    }

    processMatchedSymptoms() {
        const checked = $('input:checked');
        const unchecked = $('input:not(:checked)');
        for (let symptom of checked) {
            this.addEvidence(symptom.id, 'present', true, $(symptom).data('name'));
        }
        for (let symptom of unchecked) {
            this.addEvidence(symptom.id, 'absent', true, $(symptom).data('name'));
        }

        if (this.searchResults !== undefined && this.searchResults.length != 0) {
            this.runSymptomMatcher();
        } else {
            this.runRiskFactorInterview();
        }
    }

    addEvidence(id, presence, isInitial, name = null) {
        if (name) {
            if (presence === 'present') {
                this.presentEvidenceNames.push(name);
            } else {
                this.absentEvidenceNames.push(name);
            }
        }
        this.interview.evidence.push({
            'id': id,
            'choice_id': presence,
            'initial': isInitial
        });
    }

    runRiskFactorInterview() {
        this.app.nav.riskFactorStart();
    }

    processRiskFactors() {
        const selected = $('input:checked');
        for (const element of selected) {
            const info = element.id.split('-');
            const name = element.name;
            let presence = 'present';
            if (info[1] === 'no') {
                presence = 'absent';
            }
            this.addEvidence(info[0], presence, true, name);
        }
        if (this.riskFactorInterview !== undefined && this.riskFactorInterview.length != 0) {
            this.app.nav.runRiskFactor();
        } else {
            this.app.nav.runDiagnosis();
        }
    }

    processDiagnosisData(data) {
        this.numCalls++;
        if (data.should_stop || this.numCalls > 30 || !data.question) {
            const promises = [];
            data.conditions.forEach(condition => {
                promises.push(this.app.interface.conditions(condition.id, condition.probability));
            });
            $.when.apply($, promises).then(
                function() {
                    this.showDiagnoses();
                }.bind(this.app.nav),
                function() {
                    this.app.nav.catchError();
                }.bind(this.app.nav));
        } else {
            this.currentQuestion = data.question;
            this.app.renderer.run('main', 'question-form-' + this.currentQuestion.type, this.currentQuestion);
        }
    }

    processQuestionAnswer() {
        const selected = $(':checked');
        const inputs = $('input');
        const self = this;
        this.app.renderer.run('main', 'loader');
        switch (this.currentQuestion.type) {
            case 'single':
                this.addEvidence(this.currentQuestion.items[0].id, selected[0].id, false, this.currentQuestion.items[0].name);
                this.app.nav.runDiagnosis();
                break;
            case 'group_single':
                if (selected[0].id !== 'none' && selected[0].id != 'unknown') {
                    this.addEvidence(selected[0].id, 'present', false, selected[0].dataset.name);
                }
                this.app.nav.runDiagnosis();
                break;
            case 'group_multiple':
                inputs.each(function() {
                    if (this.id !== 'none') {
                        let presence = 'absent';
                        if (this.checked) {
                            presence = 'present';
                        }
                        self.addEvidence(this.id, presence, false, this.dataset.name);
                    }
                });
                this.app.nav.runDiagnosis();
                break;
        }
    }
}
'use strict';

class RiskFactorInterviewHandler {
    constructor(app, name = "Wherefore art thou?") {
        this.name = name;
        this.app = app;
        this.interviews = [{
                name: 'basicInterview',
                available: true,
                completed: false,
                questions: [{
                        question: 'I have recently taken or used drugs (legal or illegal), medications, tobacco, or alcohol.',
                        isRiskFactor: false,
                        riskFactorData: {
                            id: 'NRF_DRUGS'
                        },
                        dependent: 'drugsInterview'
                    },
                    {
                        question: 'I have a medical condition (such as diabetes, high blood pressure, prior surgeries or heart attack).',
                        isRiskFactor: false,
                        riskFactorData: {
                            id: 'NRF_MED_COND'
                        },
                        dependent: 'conditionsInterview'
                    },
                    {
                        question: 'I have recently suffered a physical injury.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_147',
                            common_name: 'Physical injury',
                            if_true: 'present',
                            if_false: 'absent'
                        },
                        dependent: 'injuryInterview'
                    },
                    {
                        question: 'I live, or have recently traveled outside the U.S. and/or Canada.',
                        isRiskFactor: false,
                        riskFactorData: {
                            id: 'p_13',
                            common_name: 'North America (except Mexico)',
                            if_true: null,
                            if_false: 'present'
                        },
                        dependent: 'locationInterview'
                    }
                ]
            },
            {
                name: 'femaleInterview',
                prettyName: 'Female Risk Factors',
                available: true,
                completed: false,
                description: 'Risk factors that only apply to women.',
                questions: [{
                        question: 'I am post-menopausal.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_11',
                            common_name: 'Postmenopause',
                            if_true: 'present',
                            if_false: 'absent'
                        }

                    },
                    {
                        question: 'I have given birth in the last six weeks.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_55',
                            common_name: 'Recent Childbirth',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have never had a menstrual period.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_141',
                            common_name: 'Pre-menstrual age',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I am pregnant.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_42',
                            common_name: 'Pregnancy',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    }
                ]
            },
            {
                name: 'injuryInterview',
                prettyName: 'Injury Risk Factors',
                available: true,
                completed: false,
                description: 'Risk factors relating to recent injuries.',
                questions: [{
                        question: 'I have recently experienced a traumatic injury to my chest.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_136',
                            common_name: 'Skeletal Trauma, Chest',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have recently experienced a traumatic injury to my arm or leg.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_53',
                            common_name: 'Skeletal Trauma, Limb',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have recently experienced a traumatic injury to my stomach/abdomen.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_144',
                            common_name: 'Abdominal Trauma',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have recently experienced an injury to my back.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_146',
                            common_name: 'Back Injury',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have recently experienced a traumatic injury to my head.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_136',
                            common_name: 'Head Injury',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    }
                ]
            },
            {
                name: 'drugsInterview',
                prettyName: 'Drugs and Medication Risk Factors',
                available: true,
                completed: false,
                description: 'Risk factors related to alcohol, smoking, drugs, and medications.',
                questions: [{
                        question: 'I regularly take, or have recently taken, acetaminophen (e.g. Tylenol).',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_25',
                            common_name: 'Recent acetaminophen intake',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I regularly take, or have recently taken, NSAIDS (e.g. Advil, Aleve) or corticosteroids (e.g. cortisone, prednisone).',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_44',
                            common_name: 'NSAID or corticosteroid use',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I use or take opioid medications such as oxycodone (either legally or illegally).',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_43',
                            common_name: 'Opioid use',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have recently taken or regularly take Aspirin or another salicylate medication.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_26',
                            common_name: 'Salicylate intake',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I take sleeping pills or sedatives.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_45',
                            common_name: 'Taking sleeping pills or sedatives',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have recently smoked or used cannabis (marijuana) products.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_69',
                            common_name: 'Cannabis, marijuana smoking',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I frequently consume alcohol.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_38',
                            common_name: 'Frequent alcohol consumption',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I smoke tobacco.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_28',
                            common_name: 'Smoking',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    }
                ]
            },
            {
                name: 'conditionsInterview',
                prettyName: 'Medical Condition Risk Factors',
                available: true,
                completed: false,
                description: 'Risk factors related to your medical conditions.',
                questions: [{
                        question: 'I have diabetes.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_8',
                            common_name: 'Diabetes',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have high cholesterol.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_10',
                            common_name: 'High Cholesterol',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have high blood pressure.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_9',
                            common_name: 'High Blood Pressure',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have had a heart attack in the past.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_80',
                            common_name: 'Prior Heart Attack',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        question: 'I have recently had surgery.',
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_47',
                            common_name: 'Recent Surgery',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    }
                ]
            },
            {
                name: 'locationInterview',
                prettyName: 'Location-Related Risk Factors',
                available: true,
                completed: false,
                description: 'Risk factors related to places you\'ve lived or traveled.',
                prompt: 'Select any place where you live or where you have recently traveled.',
                questions: [{
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_19',
                            common_name: 'Australia and Oceania',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_17',
                            common_name: 'Central Africa',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_15',
                            common_name: 'Europe',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_14',
                            common_name: 'Latin and South America (including Mexico)',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_21',
                            common_name: 'Middle East',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_13',
                            common_name: 'United States and Canada',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_16',
                            common_name: 'Northern Africa',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_20',
                            common_name: 'Russia, Kazakhstan and Mongolia',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_18',
                            common_name: 'Southern Africa',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    },
                    {
                        isRiskFactor: true,
                        riskFactorData: {
                            id: 'p_22',
                            common_name: 'Southwestern Asia',
                            if_true: 'present',
                            if_false: 'absent'
                        }
                    }
                ]
            }
        ];
    }

    run() {
        const interview = this.findNextAvailableInterview();
        if (interview) {
            this.app.renderer.run('main', 'riskFactorInterviews_interview-form', interview);
        } else {
            this.app.nav.riskFactorInterviewComplete();
        }
    }

    findNextAvailableInterview() {
        const interview = this.interviews.find(interview => interview.available && !interview.completed);
        return interview;
    }

    findInterviewByName(name) {
        return this.interviews.find(interview => interview.name === name);
    }

    findQuestionById(interviewName, id) {
        const interview = this.findInterviewByName(interviewName);
        const question = interview.questions.find(question => question.riskFactorData.id === id);
        return question;
    }

    markInterviewCompleted(name) {
        const interview = this.findInterviewByName(name);
        interview.completed = true;
    }

    markInterviewUnavailable(name) {
        const interview = this.findInterviewByName(name);
        interview.available = false;
    }

    processInterviewAnswers() {
        const interviewName = $('form').data('interview-name');
        const self = this;

        $('input').each(function() {
            const id = this.id;
            const checked = $(this).prop('checked');
            if (id !== 'none') {
                const question = self.findQuestionById(interviewName, id);
                if (question.isRiskFactor) {
                    const presence = checked ? question.riskFactorData.if_true : question.riskFactorData.if_false;
                    if (presence) {
                        self.app.patient.addEvidence(id, presence, true, question.riskFactorData.common_name);
                    }
                }
                if (question.hasOwnProperty('dependent') && !checked) {
                    self.markInterviewUnavailable(question.dependent);
                }
            }
        });
        this.markInterviewCompleted(interviewName);
        this.run();
    }
}
Handlebars.registerPartial("condition", Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    return container.escapeExpression(container.lambda(depth0, depth0))
    + " ";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, alias1=container.lambda, alias2=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<div class=\"condition "
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"prevalence") : depth0), depth0))
    + " "
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"acuteness") : depth0), depth0))
    + " "
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"severity") : depth0), depth0))
    + " "
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"triage_level") : depth0), depth0))
    + " "
    + ((stack1 = lookupProperty(helpers,"each").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"categories") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":1,"column":101},"end":{"line":1,"column":139}}})) != null ? stack1 : "")
    + " card-panel\"\n    id=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\"\n    <div class=\"card-content\">\n        <span class=\"card-title\">"
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"common_name") : depth0), depth0))
    + "</span>\n        <p class=\"info\"><span class=\"label\">Prevalence: </span>"
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"prevalence") : depth0), depth0))
    + "</p>\n        <p class=\"info\"><span class=\"label\">Severity: </span>"
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"severity") : depth0), depth0))
    + "</p>\n        <p><span class=\"label\">Recommendation: </span>"
    + alias2(alias1(((stack1 = (depth0 != null ? lookupProperty(depth0,"extras") : depth0)) != null ? lookupProperty(stack1,"hint") : stack1), depth0))
    + "</p>\n    </div>\n</div>";
},"useData":true}));
Handlebars.registerPartial("disclaimer-text", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "\n";
},"useData":true}));
Handlebars.registerPartial("disclaimer", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<div class=\"funny-disclaimer\">\n  <h4>We're a bunch of students, no doctors</h4>\n  <p class=\"flow-text\"><u><h5>Terms of Service</h5></u><br><b>Before using the checkup, please read Terms of Service.</b><br><br> Remember that:<br><ul><li><b>Checkup is not a diagnosis.</b> Checkup is for informational purposes and is not a qualified medical opinion.</li><br><li><b>Do not use in emergencies.</b> In case of health emergency, call your local emergency number immediately.</li><br><li><b>Your data is safe.</b> Information that you provide is anonymous and not shared with anyone.</li></ul></p>\n</div>\n<div class=\"disclaimer\">\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"disclaimer-text"),depth0,{"name":"disclaimer-text","data":data,"indent":"  ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "</div>\n<form class=\"start\" action=\"#\" method=\"post\">\n  <button type=\"submit\" name=\"accept-disclaimer\" id=\"accept-disclaimer\" data-clickable=\"acceptDisclaimer\" class=\"btn btn-large\">I agree to all T&Cs</button>\n</form>\n";
},"usePartial":true,"useData":true}));
Handlebars.registerPartial("error", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<h2>Oh No, Something Went Wrong!</h2>\n<p>Please try again later.  If the problem persists, please send an email to <a href=\"mailto:alisharao@gmail.com\">the webmaster</a>.</p>\n<a href=\"#\" id=\"start-over\" data-clickable=\"startOver\">Start Over</a>";
},"useData":true}));
Handlebars.registerPartial("footer", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = container.invokePartial(lookupProperty(partials,"disclaimer-text"),depth0,{"name":"disclaimer-text","data":data,"helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "");
},"usePartial":true,"useData":true}));
Handlebars.registerPartial("header-disclaimer", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<h2 class=\"disclaimer\">Disclaimer</h2>";
},"useData":true}));
Handlebars.registerPartial("header-home", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"header-group\">\n <h1 class=\"home with-sub\">Symptom Checker</h1>\n</div>\n";
},"useData":true}));
Handlebars.registerPartial("header-symptomChecker", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"header-group not-home\">\n <h1 class=\"home with-sub\">Symptom Checker</h1>\n</div>\n\n<a href=\"#\" data-clickable=\"startOver\" id=\"start-over\" class=\"btn btn-small\">Start Over</a>";
},"useData":true}));
Handlebars.registerPartial("home", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"instructions\">\n  </div>\n<form class=\"start\"action=\"#\" method=\"post\"><br><br><br><br><br><br><br><br><br>\n  <button type=\"submit\" name=\"diagnose-me\" id=\"diagnose-me\" data-clickable=\"diagnoseMe\"class=\"btn btn-large\">Start</button>\n</form>\n";
},"useData":true}));
Handlebars.registerPartial("interview-start", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<h2>Great, let's get started!</h2>\n\n<form class=\"interview-start\" action=\"#\" method=\"post\">\n  <fieldset>\n    <legend>Tell Me About Yourself</legend>\n    <ul id=\"errors\" style=\"display: none;\"></ul>\n    <label for=\"first-name\">What can I call you?\n    <input type=\"text\" name=\"first-name\" id=\"first-name\"placeholder=\"First Name\" minlength=2 required></label>\n    \n    <label for=\"age\">How old are you?\n    <input type=\"number\" name=\"age\" required></label>\n    <label for=\"gender\">What is your gender?</label><br>\n    <label for=\"male\"><input type=\"radio\" name=\"gender\" value=\"male\" id=\"male\" class=\"with-gap\" required><span>Male</span></label>\n    <label for=\"female\"><input type=\"radio\" name=\"gender\" value=\"female\" id=\"female\" class=\"with-gap\" required><span>Female</span></label><label for=\"other\"><input type=\"radio\" name=\"gender\" value=\"other\" id=\"other\" class=\"with-gap\" required><span>Other</span></label>\n<br>\n    <button type=\"submit\" name=\"submit\" id=\"submit-interview-start\" data-clickable=\"submitInterviewStart\" class=\"btn btn-large right\">Continue</button>\n  </fieldset>\n</form>";
},"useData":true}));
Handlebars.registerPartial("loader", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"preloader-wrapper big active\">\n    <div class=\"spinner-layer spinner-blue-only\">\n        <div class=\"circle-clipper left\">\n            <div class=\"circle\"></div>\n        </div>\n        <div class=\"gap-patch\">\n            <div class=\"circle\"></div>\n        </div>\n        <div class=\"circle-clipper right\">\n            <div class=\"circle\"></div>\n        </div>\n    </div>\n</div>";
},"useData":true}));
Handlebars.registerPartial("question-form-group_multiple", Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var alias1=container.lambda, alias2=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "        <label for=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\">\n            <input type=\"checkbox\" name=\"choice\" id=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\" data-name=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"name") : depth0), depth0))
    + "\" class=\"choice-group filled-in\"><span>"
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"name") : depth0), depth0))
    + "</span>\n        </label><br>\n";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<form action=\"#\" id=\"diagnosis-question\" data-type=\"group_multiple\">\n    <fieldset>\n        <legend>"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"text") || (depth0 != null ? lookupProperty(depth0,"text") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"text","hash":{},"data":data,"loc":{"start":{"line":3,"column":16},"end":{"line":3,"column":24}}}) : helper)))
    + " (Select all that apply)</legend>\n        <ul id=\"errors\" style=\"display: none;\"></ul>\n"
    + ((stack1 = lookupProperty(helpers,"each").call(alias1,(depth0 != null ? lookupProperty(depth0,"items") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":5,"column":8},"end":{"line":9,"column":17}}})) != null ? stack1 : "")
    + "        <label for=\"none\">\n            <input type=\"checkbox\" name=\"choice\" id=\"none\" value=\"none\" class=\"choice-group filled-in\"><span>None of the Above</span>\n        </label><br>\n        <button type=\"submit\" id=\"submit-question-answer\" data-clickable=\"submitQuestionAnswer\" class=\"btn right\">Continue</button>\n    </fieldset>\n</form>";
},"useData":true}));
Handlebars.registerPartial("question-form-group_single", Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var alias1=container.lambda, alias2=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "            <label for=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\">\n                <input type=\"radio\" name=\"choice\" id=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\" value=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\" data-name=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"name") : depth0), depth0))
    + "\" class=\"choice-group with-gap\" required>\n                <span>"
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"name") : depth0), depth0))
    + "</span>\n            </label><br>\n";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<form action=\"#\" id=\"diagnosis-question\" data-type=\"group_single\">\n    <fieldset>\n        <legend>"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"text") || (depth0 != null ? lookupProperty(depth0,"text") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"text","hash":{},"data":data,"loc":{"start":{"line":3,"column":16},"end":{"line":3,"column":24}}}) : helper)))
    + "</legend>\n        <ul id=\"errors\" style=\"display: none;\"></ul>\n"
    + ((stack1 = lookupProperty(helpers,"each").call(alias1,(depth0 != null ? lookupProperty(depth0,"items") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":5,"column":8},"end":{"line":10,"column":17}}})) != null ? stack1 : "")
    + "        <label for=\"none\">\n            <input type=\"radio\" name=\"choice\" id=\"none\" value=\"none\" class=\"choice-group with-gap\">\n            <span>None of the Above</span>\n        </label><br>\n        <label for=\"unknown\">\n            <input type=\"radio\" name=\"choice\" id=\"unknown\" value=\"unknown\" class=\"choice-group with-gap\">\n            <span>I Don't Know</span>\n        </label><br>\n        <button type=\"submit\" id=\"submit-question-answer\" data-clickable=\"submitQuestionAnswer\" class=\"btn right\">Continue</button>\n    </fieldset>\n</form>";
},"useData":true}));
Handlebars.registerPartial("question-form-single", Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = lookupProperty(helpers,"each").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"choices") : depth0),{"name":"each","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":6,"column":12},"end":{"line":11,"column":21}}})) != null ? stack1 : "");
},"2":function(container,depth0,helpers,partials,data) {
    var alias1=container.lambda, alias2=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "                <label for=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\">\n                    <input type=\"radio\" name=\"choice\" id=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\" value =\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\" required class=\"choice-group with-gap\">\n                    <span>"
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"label") : depth0), depth0))
    + "</span>\n                </label><br>\n";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<form action=\"#\" id=\"diagnosis-question\" data-type=\"single\">\n    <fieldset>\n        <legend>"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"text") || (depth0 != null ? lookupProperty(depth0,"text") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"text","hash":{},"data":data,"loc":{"start":{"line":3,"column":16},"end":{"line":3,"column":24}}}) : helper)))
    + "</legend>\n        <ul id=\"errors\" style=\"display: none;\"></ul>\n"
    + ((stack1 = lookupProperty(helpers,"each").call(alias1,(depth0 != null ? lookupProperty(depth0,"items") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":5,"column":8},"end":{"line":12,"column":17}}})) != null ? stack1 : "")
    + "        <button type=\"submit\" id=\"submit-question-answer\" data-clickable=\"submitQuestionAnswer\" class=\"btn right\">Continue</button>\n    </fieldset>\n</form>";
},"useData":true}));
Handlebars.registerPartial("risk-factor-intro", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<br><br><h2>Thanks for that information, "
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"name") || (depth0 != null ? lookupProperty(depth0,"name") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"name","hash":{},"data":data,"loc":{"start":{"line":1,"column":33},"end":{"line":1,"column":41}}}) : helper)))
    + ".</h2>\n<p>The next few pages will ask you about some questions common risk factors.  Check any that apply to you.  This will help me make a more accurate diagnosis.</p>\n<button type=\"submit\" id=\"run-risk-factor-interview\" data-clickable=\"runRiskFactorInterview\" class=\"btn btn-large right\">Continue</button>\n<div class=\"clearfix\"></div>";
},"useData":true}));
Handlebars.registerPartial("risk-factor-radio-group", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var alias1=container.lambda, alias2=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<label for=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "-yes\">Yes\n    <input type=\"radio\" name=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"common_name") : depth0), depth0))
    + "\" id=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "-yes\" value=\"Yes\" class=\"risk-factor\">\n</label>\n<label for=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "-no\">No\n    <input type=\"radio\" name=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"common_name") : depth0), depth0))
    + "\" id=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "-no\" value=\"No\" class=\"risk-factor\">\n</label>\n<br>";
},"useData":true}));
Handlebars.registerPartial("show-conditions", Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = container.invokePartial(lookupProperty(partials,"condition"),depth0,{"name":"condition","data":data,"indent":"            ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "");
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "\n    <h2>Possible Conditions</h2>\n    <p>Based on the information you have provided us, the following conditions are possible matches for your symptoms:</p>\n    <div class=\"card-container\">\n"
    + ((stack1 = lookupProperty(helpers,"each").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"conditions") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":5,"column":8},"end":{"line":7,"column":17}}})) != null ? stack1 : "")
    + "    </div>";
},"usePartial":true,"useData":true}));
Handlebars.registerPartial("symptom-interview", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<h2>Hello, "
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"name") || (depth0 != null ? lookupProperty(depth0,"name") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"name","hash":{},"data":data,"loc":{"start":{"line":1,"column":11},"end":{"line":1,"column":19}}}) : helper)))
    + "!</h2>\n<form class=\"symptom-entry\" action=\"#\" method=\"post\">\n  <label for=\"enter-symptoms\" class=\"flow-text\">Tell us about the symptoms you're facing. Try limiting your words and be as descriptive as possible. Donot hold back, let us help you :) </label><br>\n  <ul id=\"errors\" style=\"display: none;\"></ul>\n  <textarea name=\"enter-symptoms\" placeholder=\"Enter symptoms\" id=\"enter-symptoms\" required></textarea><br>\n  <button type=\"submit\" name=\"submit-symptoms\" id=\"submit-symptoms\" data-clickable=\"submitSymptoms\" class=\"btn btn-large\">Submit Symptoms</button>\n</form>\n";
},"useData":true}));
Handlebars.registerPartial("symptom-matcher-form", Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var alias1=container.lambda, alias2=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "            <label for=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\"><input type=\"checkbox\" name=\"symptom\" id=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"id") : depth0), depth0))
    + "\" class=\"symptom-group filled-in indigo darken-4\" data-name=\""
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"label") : depth0), depth0))
    + "\"><span>"
    + alias2(alias1((depth0 != null ? lookupProperty(depth0,"label") : depth0), depth0))
    + "</span></label><br>\n";
},"3":function(container,depth0,helpers,partials,data) {
    return "            <p class=\"empty\">Nothing found.</p>\n";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<form action=\"#\" class=\"symptom-matcher\">\n    <h3>You said: \""
    + container.escapeExpression(container.lambda(((stack1 = ((stack1 = (depth0 != null ? lookupProperty(depth0,"params") : depth0)) != null ? lookupProperty(stack1,"parseData") : stack1)) != null ? lookupProperty(stack1,"orth") : stack1), depth0))
    + "\"</h3>\n    <fieldset>\n        <legend>Check the symptoms that match your entry above:</legend>\n        <ul id=\"errors\" style=\"display: none;\"></ul>\n"
    + ((stack1 = lookupProperty(helpers,"each").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"data") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.program(3, data, 0),"data":data,"loc":{"start":{"line":6,"column":8},"end":{"line":10,"column":17}}})) != null ? stack1 : "")
    + "        \n        <div class=\"btn-container right\">\n            <button type=\"submit\" id=\"submit-symptom-matcher\" data-clickable=\"submitSymptomMatcher\" class=\"btn btn-large\">Continue</button>\n            <button type=\"reset\" id=\"symptoms-try-again\" data-clickable=\"symptomsTryAgain\" class=\"btn btn-large negative\">That's not what I meant. Try again.</button><br>\n        </div>\n        \n    </fieldset>\n</form>";
},"useData":true}));
Handlebars.registerPartial("symptom-matcher", Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = container.invokePartial(lookupProperty(partials,"symptom-matcher-form"),depth0,{"name":"symptom-matcher-form","data":data,"helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "");
},"usePartial":true,"useData":true}));
Handlebars.registerPartial("riskFactorInterviews_interview-form", Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "            <legend>"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"prettyName") || (depth0 != null ? lookupProperty(depth0,"prettyName") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"prettyName","hash":{},"data":data,"loc":{"start":{"line":5,"column":20},"end":{"line":5,"column":34}}}) : helper)))
    + "</legend>\n";
},"3":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = container.invokePartial(lookupProperty(partials,"riskFactorInterviews_interview-question"),depth0,{"name":"riskFactorInterviews_interview-question","data":data,"indent":"            ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "");
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<h2>Risk Factors</h2>\n<form action=\"#\" data-interview-name=\""
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"name") || (depth0 != null ? lookupProperty(depth0,"name") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"name","hash":{},"data":data,"loc":{"start":{"line":2,"column":38},"end":{"line":2,"column":46}}}) : helper)))
    + "\">\n    <fieldset>\n"
    + ((stack1 = lookupProperty(helpers,"if").call(alias1,(depth0 != null ? lookupProperty(depth0,"prettyName") : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":4,"column":8},"end":{"line":6,"column":15}}})) != null ? stack1 : "")
    + "        <p>Select each statement that applies to you.</p>\n        <ul id=\"errors\" style=\"display: none;\"></ul>\n"
    + ((stack1 = lookupProperty(helpers,"each").call(alias1,(depth0 != null ? lookupProperty(depth0,"questions") : depth0),{"name":"each","hash":{},"fn":container.program(3, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":9,"column":8},"end":{"line":11,"column":17}}})) != null ? stack1 : "")
    + "        <label for=\"none\">\n            <input type=\"checkbox\" name=\"choice\" id=\"none\" class=\"risk-factor-group filled-in\" data-none=true data-group=\"risk-factor-group\">\n            <span>None</span>\n        </label><br>\n        <button type=\"submit\" id=\"submit-risk-factors\" data-clickable=\"submitRiskFactors\" class=\"btn btn-large right\">Continue</button>\n    </fieldset>\n</form>";
},"usePartial":true,"useData":true}));
Handlebars.registerPartial("riskFactorInterviews_interview-question", Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return " "
    + container.escapeExpression(container.lambda((depth0 != null ? lookupProperty(depth0,"question") : depth0), depth0))
    + " ";
},"3":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return " "
    + container.escapeExpression(container.lambda(((stack1 = (depth0 != null ? lookupProperty(depth0,"riskFactorData") : depth0)) != null ? lookupProperty(stack1,"common_name") : stack1), depth0))
    + " ";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, alias1=container.lambda, alias2=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<label for=\""
    + alias2(alias1(((stack1 = (depth0 != null ? lookupProperty(depth0,"riskFactorData") : depth0)) != null ? lookupProperty(stack1,"id") : stack1), depth0))
    + "\">\n    <input type=\"checkbox\" name=\"choice\" id=\""
    + alias2(alias1(((stack1 = (depth0 != null ? lookupProperty(depth0,"riskFactorData") : depth0)) != null ? lookupProperty(stack1,"id") : stack1), depth0))
    + "\" class=\"risk-factor-group filled-in\" data-group=\"risk-factor-group\" data-name=\""
    + alias2(alias1(((stack1 = (depth0 != null ? lookupProperty(depth0,"riskFactorData") : depth0)) != null ? lookupProperty(stack1,"common_name") : stack1), depth0))
    + "\">\n    <span>\n        "
    + ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"question") : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.program(3, data, 0),"data":data,"loc":{"start":{"line":4,"column":8},"end":{"line":4,"column":100}}})) != null ? stack1 : "")
    + "\n    </span>\n</label><br>";
},"useData":true}));
function mainController() {
    const app = new App();
    //render the home page
    app.renderer.run('header', 'header-home');
    app.renderer.run('main', 'home');
    //listen for clicks 
    $('#main-container').on('click', '[data-clickable]', function(e) {
        e.preventDefault();
        app.nav.run(e);
    });
}
$(mainController);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFwcC5qcyIsIkluZmVybWVkaWNhSGFuZGxlci5qcyIsIk5hdkhhbmRsZXIuanMiLCJQYWdlUmVuZGVyZXIuanMiLCJQYXRpZW50LmpzIiwiUmlza0ZhY3RvckludGVydmlld0hhbmRsZXIuanMiLCJ0ZW1wbGF0ZXMuanMiLCJtYWluLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMvRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzVLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDOWNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2hYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG5jbGFzcyBBcHAge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLnBhdGllbnQgPSBuZXcgUGF0aWVudCh0aGlzKTtcbiAgICAgICAgdGhpcy5pbnRlcmZhY2UgPSBuZXcgSW5mZXJtZWRpY2FIYW5kbGVyKHRoaXMpO1xuICAgICAgICB0aGlzLm5hdiA9IG5ldyBOYXZIYW5kbGVyKHRoaXMpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFBhZ2VSZW5kZXJlcih0aGlzKTtcbiAgICAgICAgdGhpcy5yaXNrSW50ZXJ2aWV3ID0gbmV3IFJpc2tGYWN0b3JJbnRlcnZpZXdIYW5kbGVyKHRoaXMpO1xuICAgIH1cbn0iLCIndXNlIHN0cmljdCc7XG5cbmNsYXNzIEluZmVybWVkaWNhSGFuZGxlciB7XG4gICAgY29uc3RydWN0b3IoYXBwKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnVybCA9ICdodHRwczovL2FwaS5pbmZlcm1lZGljYS5jb20vdjIvJztcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHtcbiAgICAgICAgICAgICdiZWZvcmVTZW5kJzogZnVuY3Rpb24oeGhyKSB7XG4gICAgICAgICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0FwcC1JZCcsICcxNzE3ZTllZScpO1xuICAgICAgICAgICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdBcHAtS2V5JywgJ2VlMzIzYWRlZWZlM2VhNzlmMTM2MDY5OTg4YWVkNzVhJyk7XG4gICAgICAgICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0Rldi1Nb2RlJywgdHJ1ZSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ2NvbnRlbnRUeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgJ2Vycm9yJzogZnVuY3Rpb24oWE1MSHR0cFJlcXVlc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5uYXYuY2F0Y2hFcnJvcigpO1xuICAgICAgICAgICAgfS5iaW5kKHRoaXMpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY2FsbChlbmRwb2ludCwgcGFyYW1zKSB7XG4gICAgICAgIHRoaXNbZW5kcG9pbnRdKHBhcmFtcyk7XG4gICAgfVxuXG4gICAgc2VhcmNoKHBhcmFtcykge1xuICAgICAgICBjb25zdCB1cmwgPSB0aGlzLnVybCArICdzZWFyY2gnO1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24odGhpcy5zZXR0aW5ncyk7XG4gICAgICAgIHNldHRpbmdzLmRhdGEgPSB7XG4gICAgICAgICAgICAncGhyYXNlJzogcGFyYW1zLnBocmFzZSxcbiAgICAgICAgfTtcbiAgICAgICAgc2V0dGluZ3MubWV0aG9kID0gJ0dFVCc7XG4gICAgICAgIHNldHRpbmdzLnN1Y2Nlc3MgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NTZWFyY2goZGF0YSwgcGFyYW1zKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuICAgICAgICAkLmFqYXgodXJsLCBzZXR0aW5ncyk7XG4gICAgfVxuXG4gICAgcHJvY2Vzc1NlYXJjaChkYXRhLCBwYXJhbXMpIHtcbiAgICAgICAgdGhpcy5hcHAucGF0aWVudC5zZWFyY2hSZXN1bHRzLnB1c2goeyBkYXRhLCBwYXJhbXMgfSk7XG4gICAgICAgIGlmIChwYXJhbXMubGFzdCkge1xuICAgICAgICAgICAgdGhpcy5hcHAucGF0aWVudC5wcm9jZXNzU2VhcmNoRmluaXNoZWQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhcnNlKHBhcmFtcykge1xuICAgICAgICBjb25zdCB1cmwgPSB0aGlzLnVybCArICdwYXJzZSc7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih0aGlzLnNldHRpbmdzKTtcbiAgICAgICAgc2V0dGluZ3MuZGF0YSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICd0ZXh0JzogcGFyYW1zLnBocmFzZVxuICAgICAgICB9KTtcbiAgICAgICAgc2V0dGluZ3MubWV0aG9kID0gJ1BPU1QnO1xuICAgICAgICBzZXR0aW5ncy5zdWNjZXNzID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzUGFyc2UoZGF0YSwgcGFyYW1zKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuICAgICAgICAkLmFqYXgodXJsLCBzZXR0aW5ncyk7XG4gICAgfVxuXG4gICAgcHJvY2Vzc1BhcnNlKGRhdGEsIHBhcmFtcykge1xuICAgICAgICBjb25zdCBmb3VuZCA9IGRhdGEubWVudGlvbnM7XG4gICAgICAgIGlmIChmb3VuZC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLm5hdi5ub1N5bXB0b21zRm91bmQocGFyYW1zLnBocmFzZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZvdW5kLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbGV0IG5ld1BhcmFtcyA9IHtcbiAgICAgICAgICAgICAgICAgICAgJ3BocmFzZSc6IGZvdW5kW2ldWydjb21tb25fbmFtZSddLFxuICAgICAgICAgICAgICAgICAgICAncGFyc2VEYXRhJzogZm91bmRbaV1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmIChpID09PSBmb3VuZC5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ld1BhcmFtcy5sYXN0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5jYWxsKCdzZWFyY2gnLCBuZXdQYXJhbXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGlhZ25vc2lzKCkge1xuICAgICAgICBjb25zdCB1cmwgPSB0aGlzLnVybCArICdkaWFnbm9zaXMnO1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24odGhpcy5zZXR0aW5ncyk7XG4gICAgICAgIHNldHRpbmdzLmRhdGEgPSBKU09OLnN0cmluZ2lmeSh0aGlzLmFwcC5wYXRpZW50LmludGVydmlldyk7XG4gICAgICAgIHNldHRpbmdzLm1ldGhvZCA9ICdQT1NUJztcbiAgICAgICAgc2V0dGluZ3Muc3VjY2VzcyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLnBhdGllbnQucHJvY2Vzc0RpYWdub3Npc0RhdGEoZGF0YSk7XG4gICAgICAgIH0uYmluZCh0aGlzKTtcbiAgICAgICAgJC5hamF4KHVybCwgc2V0dGluZ3MpO1xuICAgIH1cblxuICAgIGNvbmRpdGlvbnMoaWQsIHByb2JhYmlsaXR5KSB7XG4gICAgICAgIGNvbnN0IHVybCA9IHRoaXMudXJsICsgJ2NvbmRpdGlvbnMvJyArIGlkO1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24odGhpcy5zZXR0aW5ncyk7XG4gICAgICAgIHNldHRpbmdzLm1ldGhvZCA9ICdHRVQnO1xuICAgICAgICBzZXR0aW5ncy5zdWNjZXNzID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgZGF0YS5wcm9iYWJpbGl0eSA9IHByb2JhYmlsaXR5O1xuICAgICAgICAgICAgdGhpcy5hcHAucGF0aWVudC5jb25kaXRpb25zLnB1c2goZGF0YSk7XG4gICAgICAgIH0uYmluZCh0aGlzKTtcbiAgICAgICAgcmV0dXJuICQuYWpheCh1cmwsIHNldHRpbmdzKTtcbiAgICB9XG59IiwiJ3VzZSBzdHJpY3QnO1xuXG5jbGFzcyBOYXZIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3RvcihhcHApIHtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgfVxuXG4gICAgcnVuKGUpIHtcbiAgICAgICAgY29uc3QgaWQgPSAkKGV2ZW50LnRhcmdldCkuZGF0YSgnY2xpY2thYmxlJyk7O1xuICAgICAgICB0aGlzW2lkXSgpO1xuICAgIH1cblxuICAgIGRpYWdub3NlTWUoKSB7XG4gICAgICAgIHRoaXMuYXBwLnJlbmRlcmVyLnJ1bignaGVhZGVyJywgJ2hlYWRlci1kaXNjbGFpbWVyJyk7XG4gICAgICAgIHRoaXMuYXBwLnJlbmRlcmVyLnJ1bignbWFpbicsICdkaXNjbGFpbWVyJyk7XG4gICAgfVxuXG4gICAgYWNjZXB0RGlzY2xhaW1lcigpIHtcbiAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdoZWFkZXInLCAnaGVhZGVyLXN5bXB0b21DaGVja2VyJyk7XG4gICAgICAgIHRoaXMuYXBwLnJlbmRlcmVyLnJ1bignbWFpbicsICdpbnRlcnZpZXctc3RhcnQnKTtcbiAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdmb290ZXInLCAnZm9vdGVyJyk7XG4gICAgICAgICQoJ2Zvb3RlcicpLnJlbW92ZUNsYXNzKCdoaWRlJyk7XG4gICAgICAgICQoJy5mb290ZXInKS5yZW1vdmVDbGFzcygnaGlkZScpO1xuICAgIH1cblxuICAgIHN1Ym1pdEludGVydmlld1N0YXJ0KCkge1xuICAgICAgICBjb25zdCB2YWxpZGF0b3IgPSAkKCdmb3JtJykudmFsaWRhdGUoe1xuICAgICAgICAgICAgZXJyb3JMYWJlbENvbnRhaW5lcjogJyNlcnJvcnMnLFxuICAgICAgICAgICAgZXJyb3JFbGVtZW50OiAnbGknLFxuICAgICAgICAgICAgbWVzc2FnZXM6IHtcbiAgICAgICAgICAgICAgICAnZmlyc3QtbmFtZSc6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6ICdQbGVhc2UgZW50ZXIgeW91ciBuYW1lLicsXG4gICAgICAgICAgICAgICAgICAgIG1pbmxlbmd0aDogJ05hbWUgbXVzdCBiZSBhdCBsZWFzdCAyIGNoYXJhY3RlcnMuJ1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJ2FnZSc6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6ICdQbGVhc2UgZW50ZXIgeW91ciBhZ2UuJ1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJ2dlbmRlcic6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6ICdQbGVhc2Ugc2VsZWN0IHlvdXIgc2V4LidcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAodmFsaWRhdG9yLmZvcm0oKSkge1xuICAgICAgICAgICAgdGhpcy5hcHAucGF0aWVudC5pbml0aWFsaXplKFxuICAgICAgICAgICAgICAgICQoJ2lucHV0W25hbWU9Zmlyc3QtbmFtZV0nKS52YWwoKSxcbiAgICAgICAgICAgICAgICAkKCdpbnB1dFtuYW1lPWFnZV0nKS52YWwoKSxcbiAgICAgICAgICAgICAgICAkKCdpbnB1dFtuYW1lPWdlbmRlcl06Y2hlY2tlZCcpLnZhbCgpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdtYWluJywgJ3N5bXB0b20taW50ZXJ2aWV3JywgdGhpcy5hcHAucGF0aWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdWJtaXRTeW1wdG9tcygpIHtcbiAgICAgICAgY29uc3QgdmFsaWRhdG9yID0gJCgnZm9ybScpLnZhbGlkYXRlKHtcbiAgICAgICAgICAgIGVycm9yTGFiZWxDb250YWluZXI6ICcjZXJyb3JzJyxcbiAgICAgICAgICAgIGVycm9yRWxlbWVudDogJ2xpJyxcbiAgICAgICAgICAgIG1lc3NhZ2VzOiB7XG4gICAgICAgICAgICAgICAgJ2VudGVyLXN5bXB0b21zJzoge1xuICAgICAgICAgICAgICAgICAgICByZXF1aXJlZDogJ1BsZWFzZSB0ZWxsIG1lIGFib3V0IHlvdXIgc3ltcHRvbXMuJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmICh2YWxpZGF0b3IuZm9ybSgpKSB7XG4gICAgICAgICAgICBjb25zdCBzeW1wdG9tcyA9ICQoJ3RleHRhcmVhJykudmFsKCk7XG4gICAgICAgICAgICB0aGlzLmFwcC5yZW5kZXJlci5ydW4oJ21haW4nLCAnbG9hZGVyJywgdGhpcy5hcHAucGF0aWVudCk7XG4gICAgICAgICAgICB0aGlzLmFwcC5pbnRlcmZhY2UuY2FsbCgncGFyc2UnLCB7ICdwaHJhc2UnOiBzeW1wdG9tcywgJ3BhdGllbnQnOiB0aGlzLmFwcC5wYXRpZW50IH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3VibWl0U3ltcHRvbU1hdGNoZXIoKSB7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRvciA9ICQoJ2Zvcm0nKS52YWxpZGF0ZSh7XG4gICAgICAgICAgICBlcnJvckxhYmVsQ29udGFpbmVyOiAnI2Vycm9ycycsXG4gICAgICAgICAgICBlcnJvckVsZW1lbnQ6ICdsaScsXG4gICAgICAgICAgICBydWxlczoge1xuICAgICAgICAgICAgICAgICdzeW1wdG9tJzoge1xuICAgICAgICAgICAgICAgICAgICByZXF1aXJlX2Zyb21fZ3JvdXA6IFsxLCBcIi5zeW1wdG9tLWdyb3VwXCJdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1lc3NhZ2VzOiB7XG4gICAgICAgICAgICAgICAgJ3N5bXB0b20nOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVfZnJvbV9ncm91cDogJ1BsZWFzZSBzZWxlY3Qgb25lIG9yIG1vcmUgb2YgdGhlIGZvbGxvd2luZyBzeW1wdG9tcy4nXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKHZhbGlkYXRvci5mb3JtKCkpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLnBhdGllbnQucHJvY2Vzc01hdGNoZWRTeW1wdG9tcygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRTeW1wdG9tTWF0Y2hlcigpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IHRoaXMuYXBwLnBhdGllbnQuc2VhcmNoUmVzdWx0cy5zaGlmdCgpO1xuICAgICAgICB0aGlzLmFwcC5yZW5kZXJlci5ydW4oJ21haW4nLCAnc3ltcHRvbS1tYXRjaGVyJywgcmVzdWx0cyk7XG4gICAgfVxuXG4gICAgcmlza0ZhY3RvclN0YXJ0KCkge1xuICAgICAgICB0aGlzLmFwcC5yZW5kZXJlci5ydW4oJ21haW4nLCAncmlzay1mYWN0b3ItaW50cm8nLCB0aGlzLmFwcC5wYXRpZW50KTtcbiAgICB9XG5cbiAgICBydW5SaXNrRmFjdG9ySW50ZXJ2aWV3KCkge1xuICAgICAgICB0aGlzLmFwcC5yaXNrSW50ZXJ2aWV3LnJ1bigpO1xuICAgIH1cblxuICAgIHN1Ym1pdFJpc2tGYWN0b3JzKCkge1xuICAgICAgICBjb25zdCB2YWxpZGF0b3IgPSAkKCdmb3JtJykudmFsaWRhdGUoe1xuICAgICAgICAgICAgZXJyb3JMYWJlbENvbnRhaW5lcjogJyNlcnJvcnMnLFxuICAgICAgICAgICAgZXJyb3JFbGVtZW50OiAnbGknLFxuICAgICAgICAgICAgcnVsZXM6IHtcbiAgICAgICAgICAgICAgICAnY2hvaWNlJzoge1xuICAgICAgICAgICAgICAgICAgICByZXF1aXJlX2Zyb21fZ3JvdXA6IFsxLCBcIi5yaXNrLWZhY3Rvci1ncm91cFwiXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZXNzYWdlczoge1xuICAgICAgICAgICAgICAgICdjaG9pY2UnOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVfZnJvbV9ncm91cDogJ0lmIG5vbmUgb2YgdGhlIHN0YXRlbWVudHMgYXBwbHkgdG8geW91LCBwbGVhc2Ugc2VsZWN0IFwiTm9uZVwiLidcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAodmFsaWRhdG9yLmZvcm0oKSkge1xuICAgICAgICAgICAgdGhpcy5hcHAucmlza0ludGVydmlldy5wcm9jZXNzSW50ZXJ2aWV3QW5zd2VycygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmlza0ZhY3RvckludGVydmlld0NvbXBsZXRlKCkge1xuICAgICAgICB0aGlzLnJ1bkRpYWdub3NpcygpO1xuICAgIH1cblxuICAgIHJ1bkRpYWdub3NpcygpIHtcbiAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdtYWluJywgJ2xvYWRlcicpO1xuICAgICAgICB0aGlzLmFwcC5pbnRlcmZhY2UuZGlhZ25vc2lzKCk7XG4gICAgfVxuXG4gICAgc2hvd0RpYWdub3NlcygpIHtcbiAgICAgICAgY29uc3Qgd3JhcHBlciA9IHsgJ2NvbmRpdGlvbnMnOiB0aGlzLmFwcC5wYXRpZW50LmNvbmRpdGlvbnMgfTtcbiAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdtYWluJywgJ3Nob3ctY29uZGl0aW9ucycsIHdyYXBwZXIpO1xuICAgIH1cblxuICAgIHN1Ym1pdFF1ZXN0aW9uQW5zd2VyKCkge1xuICAgICAgICBjb25zdCB2YWxpZGF0b3IgPSAkKCdmb3JtJykudmFsaWRhdGUoe1xuICAgICAgICAgICAgZXJyb3JMYWJlbENvbnRhaW5lcjogJyNlcnJvcnMnLFxuICAgICAgICAgICAgZXJyb3JFbGVtZW50OiAnbGknLFxuICAgICAgICAgICAgcnVsZXM6IHtcbiAgICAgICAgICAgICAgICAnY2hvaWNlJzoge1xuICAgICAgICAgICAgICAgICAgICByZXF1aXJlX2Zyb21fZ3JvdXA6IFsxLCBcIi5jaG9pY2UtZ3JvdXBcIl1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbWVzc2FnZXM6IHtcbiAgICAgICAgICAgICAgICAnY2hvaWNlJzoge1xuICAgICAgICAgICAgICAgICAgICByZXF1aXJlX2Zyb21fZ3JvdXA6ICdQbGVhc2Ugc2VsZWN0IGFuIGFuc3dlciwgb3Igc2VsZWN0IFwiTm9uZVwiIGlmIG5vbmUgb2YgdGhlIHN0YXRlbWVudHMgYXBwbHkgdG8geW91LidcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAodmFsaWRhdG9yLmZvcm0oKSkge1xuICAgICAgICAgICAgdGhpcy5hcHAucGF0aWVudC5wcm9jZXNzUXVlc3Rpb25BbnN3ZXIoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0T3ZlcigpIHtcbiAgICAgICAgbG9jYXRpb24ucmVsb2FkKHRydWUpO1xuICAgIH1cblxuICAgIGNhdGNoRXJyb3IoKSB7XG4gICAgICAgIHRoaXMuYXBwLnJlbmRlcmVyLnJ1bignbWFpbicsICdlcnJvcicpO1xuICAgIH1cblxuICAgIG5vU3ltcHRvbXNGb3VuZChwaHJhc2UpIHtcbiAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdtYWluJywgJ3N5bXB0b20taW50ZXJ2aWV3JywgdGhpcy5hcHAucGF0aWVudCk7XG4gICAgICAgICQoJyNlcnJvcnMnKS5yZW1vdmVBdHRyKCdzdHlsZScpLmh0bWwoJzxwIGNsYXNzPVwiZXJyb3JcIj5ObyBpbmZvcm1hdGlvbiBmb3VuZCBmb3I6IFwiJyArIHBocmFzZSArICdcIi4gIFBsZWFzZSB0cnkgYWdhaW4uJyk7XG4gICAgfVxuXG4gICAgc3ltcHRvbXNUcnlBZ2FpbihwaHJhc2UpIHtcbiAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdtYWluJywgJ3N5bXB0b20taW50ZXJ2aWV3JywgdGhpcy5hcHAucGF0aWVudCk7XG4gICAgfVxufSIsIid1c2Ugc3RyaWN0JztcblxuY2xhc3MgUGFnZVJlbmRlcmVyIHtcbiAgICBydW4oc2VsZWN0b3IsIG5hbWUsIGRhdGEgPSB7fSkge1xuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IEhhbmRsZWJhcnMucGFydGlhbHNbbmFtZV07XG4gICAgICAgICQoc2VsZWN0b3IpLmh0bWwodGVtcGxhdGUoZGF0YSkpLmF0dHIoJ2NsYXNzJywgJ2NvbnRhaW5lcicpLmFkZENsYXNzKG5hbWUpO1xuICAgICAgICAvL2luaXRpYWxpemUgTWF0ZXJpYWxpemUgSlMgZmVhdHVyZXNcbiAgICAgICAgTS5BdXRvSW5pdCgpO1xuICAgIH1cbn0iLCIndXNlIHN0cmljdCc7XG5cbmNsYXNzIFBhdGllbnQge1xuICAgIGNvbnN0cnVjdG9yKGFwcCkge1xuICAgICAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICAgICAgdGhpcy5pbnRlcnZpZXcgPSB7XG4gICAgICAgICAgICAnc2V4JzogbnVsbCxcbiAgICAgICAgICAgICdhZ2UnOiBudWxsLFxuICAgICAgICAgICAgJ2V2aWRlbmNlJzogW11cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5wcmVzZW50RXZpZGVuY2VOYW1lcyA9IFtdO1xuICAgICAgICB0aGlzLmFic2VudEV2aWRlbmNlTmFtZXMgPSBbXTtcbiAgICAgICAgdGhpcy5zZWFyY2hSZXN1bHRzID0gW107XG4gICAgICAgIHRoaXMubnVtQ2FsbHMgPSAwO1xuICAgICAgICB0aGlzLmNvbmRpdGlvbnMgPSBbXTtcbiAgICB9XG5cbiAgICBpbml0aWFsaXplKG5hbWUsIGFnZSwgZ2VuZGVyKSB7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMuaW50ZXJ2aWV3LmFnZSA9IGFnZTtcbiAgICAgICAgdGhpcy5pbnRlcnZpZXcuc2V4ID0gZ2VuZGVyO1xuICAgICAgICB0aGlzLnByb2Nlc3NBZ2UoKTtcbiAgICAgICAgdGhpcy5wcm9jZXNzR2VuZGVyKCk7XG4gICAgfVxuXG4gICAgcHJvY2Vzc0FnZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuaW50ZXJ2aWV3LmFnZSA8IDE4KSB7XG4gICAgICAgICAgICB0aGlzLmFkZEV2aWRlbmNlKCdwXzY1JywgJ3ByZXNlbnQnLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmludGVydmlldy5hZ2UgPiA0MCkge1xuICAgICAgICAgICAgdGhpcy5hZGRFdmlkZW5jZSgncF8zJywgJ3ByZXNlbnQnLCB0cnVlKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuaW50ZXJ2aWV3LmFnZSA+PSA0NSAmJiB0aGlzLmludGVydmlldy5hZ2UgPD0gNTUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEV2aWRlbmNlKCdwXzQnLCAncHJlc2VudCcsIHRydWUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmludGVydmlldy5hZ2UgPiA2MCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkRXZpZGVuY2UoJ3BfNScsICdwcmVzZW50JywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm9jZXNzR2VuZGVyKCkge1xuICAgICAgICBpZiAodGhpcy5pbnRlcnZpZXcuc2V4ID09PSAnZmVtYWxlJykge1xuICAgICAgICAgICAgdGhpcy5hZGRFdmlkZW5jZSgncF8xJywgJ3ByZXNlbnQnLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLnJpc2tJbnRlcnZpZXcubWFya0ludGVydmlld1VuYXZhaWxhYmxlKCdmZW1hbGVJbnRlcnZpZXcnKTtcbiAgICAgICAgICAgIHRoaXMuYWRkRXZpZGVuY2UoJ3BfMicsICdwcmVzZW50JywgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm9jZXNzU2VhcmNoRmluaXNoZWQoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlYXJjaFJlc3VsdHMgIT09IHVuZGVmaW5lZCAmJiB0aGlzLnNlYXJjaFJlc3VsdHMubGVuZ3RoICE9IDApIHtcbiAgICAgICAgICAgIHRoaXMucnVuU3ltcHRvbU1hdGNoZXIoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJ1blN5bXB0b21NYXRjaGVyKCkge1xuICAgICAgICB0aGlzLmFwcC5uYXYuc3RhcnRTeW1wdG9tTWF0Y2hlcigpO1xuICAgIH1cblxuICAgIHByb2Nlc3NNYXRjaGVkU3ltcHRvbXMoKSB7XG4gICAgICAgIGNvbnN0IGNoZWNrZWQgPSAkKCdpbnB1dDpjaGVja2VkJyk7XG4gICAgICAgIGNvbnN0IHVuY2hlY2tlZCA9ICQoJ2lucHV0Om5vdCg6Y2hlY2tlZCknKTtcbiAgICAgICAgZm9yIChsZXQgc3ltcHRvbSBvZiBjaGVja2VkKSB7XG4gICAgICAgICAgICB0aGlzLmFkZEV2aWRlbmNlKHN5bXB0b20uaWQsICdwcmVzZW50JywgdHJ1ZSwgJChzeW1wdG9tKS5kYXRhKCduYW1lJykpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IHN5bXB0b20gb2YgdW5jaGVja2VkKSB7XG4gICAgICAgICAgICB0aGlzLmFkZEV2aWRlbmNlKHN5bXB0b20uaWQsICdhYnNlbnQnLCB0cnVlLCAkKHN5bXB0b20pLmRhdGEoJ25hbWUnKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zZWFyY2hSZXN1bHRzICE9PSB1bmRlZmluZWQgJiYgdGhpcy5zZWFyY2hSZXN1bHRzLmxlbmd0aCAhPSAwKSB7XG4gICAgICAgICAgICB0aGlzLnJ1blN5bXB0b21NYXRjaGVyKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnJ1blJpc2tGYWN0b3JJbnRlcnZpZXcoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFkZEV2aWRlbmNlKGlkLCBwcmVzZW5jZSwgaXNJbml0aWFsLCBuYW1lID0gbnVsbCkge1xuICAgICAgICBpZiAobmFtZSkge1xuICAgICAgICAgICAgaWYgKHByZXNlbmNlID09PSAncHJlc2VudCcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnByZXNlbnRFdmlkZW5jZU5hbWVzLnB1c2gobmFtZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYWJzZW50RXZpZGVuY2VOYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuaW50ZXJ2aWV3LmV2aWRlbmNlLnB1c2goe1xuICAgICAgICAgICAgJ2lkJzogaWQsXG4gICAgICAgICAgICAnY2hvaWNlX2lkJzogcHJlc2VuY2UsXG4gICAgICAgICAgICAnaW5pdGlhbCc6IGlzSW5pdGlhbFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBydW5SaXNrRmFjdG9ySW50ZXJ2aWV3KCkge1xuICAgICAgICB0aGlzLmFwcC5uYXYucmlza0ZhY3RvclN0YXJ0KCk7XG4gICAgfVxuXG4gICAgcHJvY2Vzc1Jpc2tGYWN0b3JzKCkge1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9ICQoJ2lucHV0OmNoZWNrZWQnKTtcbiAgICAgICAgZm9yIChjb25zdCBlbGVtZW50IG9mIHNlbGVjdGVkKSB7XG4gICAgICAgICAgICBjb25zdCBpbmZvID0gZWxlbWVudC5pZC5zcGxpdCgnLScpO1xuICAgICAgICAgICAgY29uc3QgbmFtZSA9IGVsZW1lbnQubmFtZTtcbiAgICAgICAgICAgIGxldCBwcmVzZW5jZSA9ICdwcmVzZW50JztcbiAgICAgICAgICAgIGlmIChpbmZvWzFdID09PSAnbm8nKSB7XG4gICAgICAgICAgICAgICAgcHJlc2VuY2UgPSAnYWJzZW50JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYWRkRXZpZGVuY2UoaW5mb1swXSwgcHJlc2VuY2UsIHRydWUsIG5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnJpc2tGYWN0b3JJbnRlcnZpZXcgIT09IHVuZGVmaW5lZCAmJiB0aGlzLnJpc2tGYWN0b3JJbnRlcnZpZXcubGVuZ3RoICE9IDApIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLm5hdi5ydW5SaXNrRmFjdG9yKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFwcC5uYXYucnVuRGlhZ25vc2lzKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm9jZXNzRGlhZ25vc2lzRGF0YShkYXRhKSB7XG4gICAgICAgIHRoaXMubnVtQ2FsbHMrKztcbiAgICAgICAgaWYgKGRhdGEuc2hvdWxkX3N0b3AgfHwgdGhpcy5udW1DYWxscyA+IDMwIHx8ICFkYXRhLnF1ZXN0aW9uKSB7XG4gICAgICAgICAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgICAgICAgICAgZGF0YS5jb25kaXRpb25zLmZvckVhY2goY29uZGl0aW9uID0+IHtcbiAgICAgICAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuYXBwLmludGVyZmFjZS5jb25kaXRpb25zKGNvbmRpdGlvbi5pZCwgY29uZGl0aW9uLnByb2JhYmlsaXR5KSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQud2hlbi5hcHBseSgkLCBwcm9taXNlcykudGhlbihcbiAgICAgICAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaG93RGlhZ25vc2VzKCk7XG4gICAgICAgICAgICAgICAgfS5iaW5kKHRoaXMuYXBwLm5hdiksXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXBwLm5hdi5jYXRjaEVycm9yKCk7XG4gICAgICAgICAgICAgICAgfS5iaW5kKHRoaXMuYXBwLm5hdikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UXVlc3Rpb24gPSBkYXRhLnF1ZXN0aW9uO1xuICAgICAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdtYWluJywgJ3F1ZXN0aW9uLWZvcm0tJyArIHRoaXMuY3VycmVudFF1ZXN0aW9uLnR5cGUsIHRoaXMuY3VycmVudFF1ZXN0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb2Nlc3NRdWVzdGlvbkFuc3dlcigpIHtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSAkKCc6Y2hlY2tlZCcpO1xuICAgICAgICBjb25zdCBpbnB1dHMgPSAkKCdpbnB1dCcpO1xuICAgICAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucnVuKCdtYWluJywgJ2xvYWRlcicpO1xuICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudFF1ZXN0aW9uLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ3NpbmdsZSc6XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRFdmlkZW5jZSh0aGlzLmN1cnJlbnRRdWVzdGlvbi5pdGVtc1swXS5pZCwgc2VsZWN0ZWRbMF0uaWQsIGZhbHNlLCB0aGlzLmN1cnJlbnRRdWVzdGlvbi5pdGVtc1swXS5uYW1lKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5uYXYucnVuRGlhZ25vc2lzKCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdncm91cF9zaW5nbGUnOlxuICAgICAgICAgICAgICAgIGlmIChzZWxlY3RlZFswXS5pZCAhPT0gJ25vbmUnICYmIHNlbGVjdGVkWzBdLmlkICE9ICd1bmtub3duJykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEV2aWRlbmNlKHNlbGVjdGVkWzBdLmlkLCAncHJlc2VudCcsIGZhbHNlLCBzZWxlY3RlZFswXS5kYXRhc2V0Lm5hbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmFwcC5uYXYucnVuRGlhZ25vc2lzKCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdncm91cF9tdWx0aXBsZSc6XG4gICAgICAgICAgICAgICAgaW5wdXRzLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlkICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBwcmVzZW5jZSA9ICdhYnNlbnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXNlbmNlID0gJ3ByZXNlbnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5hZGRFdmlkZW5jZSh0aGlzLmlkLCBwcmVzZW5jZSwgZmFsc2UsIHRoaXMuZGF0YXNldC5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuYXBwLm5hdi5ydW5EaWFnbm9zaXMoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn0iLCIndXNlIHN0cmljdCc7XG5cbmNsYXNzIFJpc2tGYWN0b3JJbnRlcnZpZXdIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIG5hbWUgPSBcIldoZXJlZm9yZSBhcnQgdGhvdT9cIikge1xuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgICAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICAgICAgdGhpcy5pbnRlcnZpZXdzID0gW3tcbiAgICAgICAgICAgICAgICBuYW1lOiAnYmFzaWNJbnRlcnZpZXcnLFxuICAgICAgICAgICAgICAgIGF2YWlsYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBjb21wbGV0ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHF1ZXN0aW9uczogW3tcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiAnSSBoYXZlIHJlY2VudGx5IHRha2VuIG9yIHVzZWQgZHJ1Z3MgKGxlZ2FsIG9yIGlsbGVnYWwpLCBtZWRpY2F0aW9ucywgdG9iYWNjbywgb3IgYWxjb2hvbC4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdOUkZfRFJVR1MnXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVwZW5kZW50OiAnZHJ1Z3NJbnRlcnZpZXcnXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiAnSSBoYXZlIGEgbWVkaWNhbCBjb25kaXRpb24gKHN1Y2ggYXMgZGlhYmV0ZXMsIGhpZ2ggYmxvb2QgcHJlc3N1cmUsIHByaW9yIHN1cmdlcmllcyBvciBoZWFydCBhdHRhY2spLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ05SRl9NRURfQ09ORCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXBlbmRlbnQ6ICdjb25kaXRpb25zSW50ZXJ2aWV3J1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxdWVzdGlvbjogJ0kgaGF2ZSByZWNlbnRseSBzdWZmZXJlZCBhIHBoeXNpY2FsIGluanVyeS4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTQ3JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ1BoeXNpY2FsIGluanVyeScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfdHJ1ZTogJ3ByZXNlbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX2ZhbHNlOiAnYWJzZW50J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlcGVuZGVudDogJ2luanVyeUludGVydmlldydcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGxpdmUsIG9yIGhhdmUgcmVjZW50bHkgdHJhdmVsZWQgb3V0c2lkZSB0aGUgVS5TLiBhbmQvb3IgQ2FuYWRhLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnTm9ydGggQW1lcmljYSAoZXhjZXB0IE1leGljbyknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdwcmVzZW50J1xuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlcGVuZGVudDogJ2xvY2F0aW9uSW50ZXJ2aWV3J1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZmVtYWxlSW50ZXJ2aWV3JyxcbiAgICAgICAgICAgICAgICBwcmV0dHlOYW1lOiAnRmVtYWxlIFJpc2sgRmFjdG9ycycsXG4gICAgICAgICAgICAgICAgYXZhaWxhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgIGNvbXBsZXRlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSaXNrIGZhY3RvcnMgdGhhdCBvbmx5IGFwcGx5IHRvIHdvbWVuLicsXG4gICAgICAgICAgICAgICAgcXVlc3Rpb25zOiBbe1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGFtIHBvc3QtbWVub3BhdXNhbC4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTEnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnUG9zdG1lbm9wYXVzZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfdHJ1ZTogJ3ByZXNlbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX2ZhbHNlOiAnYWJzZW50J1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiAnSSBoYXZlIGdpdmVuIGJpcnRoIGluIHRoZSBsYXN0IHNpeCB3ZWVrcy4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfNTUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnUmVjZW50IENoaWxkYmlydGgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGhhdmUgbmV2ZXIgaGFkIGEgbWVuc3RydWFsIHBlcmlvZC4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTQxJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ1ByZS1tZW5zdHJ1YWwgYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiAnSSBhbSBwcmVnbmFudC4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfNDInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnUHJlZ25hbmN5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdpbmp1cnlJbnRlcnZpZXcnLFxuICAgICAgICAgICAgICAgIHByZXR0eU5hbWU6ICdJbmp1cnkgUmlzayBGYWN0b3JzJyxcbiAgICAgICAgICAgICAgICBhdmFpbGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgY29tcGxldGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Jpc2sgZmFjdG9ycyByZWxhdGluZyB0byByZWNlbnQgaW5qdXJpZXMuJyxcbiAgICAgICAgICAgICAgICBxdWVzdGlvbnM6IFt7XG4gICAgICAgICAgICAgICAgICAgICAgICBxdWVzdGlvbjogJ0kgaGF2ZSByZWNlbnRseSBleHBlcmllbmNlZCBhIHRyYXVtYXRpYyBpbmp1cnkgdG8gbXkgY2hlc3QuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUmlza0ZhY3RvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdwXzEzNicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdTa2VsZXRhbCBUcmF1bWEsIENoZXN0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiAnSSBoYXZlIHJlY2VudGx5IGV4cGVyaWVuY2VkIGEgdHJhdW1hdGljIGluanVyeSB0byBteSBhcm0gb3IgbGVnLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF81MycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdTa2VsZXRhbCBUcmF1bWEsIExpbWInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGhhdmUgcmVjZW50bHkgZXhwZXJpZW5jZWQgYSB0cmF1bWF0aWMgaW5qdXJ5IHRvIG15IHN0b21hY2gvYWJkb21lbi4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTQ0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ0FiZG9taW5hbCBUcmF1bWEnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGhhdmUgcmVjZW50bHkgZXhwZXJpZW5jZWQgYW4gaW5qdXJ5IHRvIG15IGJhY2suJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUmlza0ZhY3RvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdwXzE0NicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdCYWNrIEluanVyeScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfdHJ1ZTogJ3ByZXNlbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX2ZhbHNlOiAnYWJzZW50J1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxdWVzdGlvbjogJ0kgaGF2ZSByZWNlbnRseSBleHBlcmllbmNlZCBhIHRyYXVtYXRpYyBpbmp1cnkgdG8gbXkgaGVhZC4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTM2JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ0hlYWQgSW5qdXJ5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdkcnVnc0ludGVydmlldycsXG4gICAgICAgICAgICAgICAgcHJldHR5TmFtZTogJ0RydWdzIGFuZCBNZWRpY2F0aW9uIFJpc2sgRmFjdG9ycycsXG4gICAgICAgICAgICAgICAgYXZhaWxhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgIGNvbXBsZXRlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSaXNrIGZhY3RvcnMgcmVsYXRlZCB0byBhbGNvaG9sLCBzbW9raW5nLCBkcnVncywgYW5kIG1lZGljYXRpb25zLicsXG4gICAgICAgICAgICAgICAgcXVlc3Rpb25zOiBbe1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIHJlZ3VsYXJseSB0YWtlLCBvciBoYXZlIHJlY2VudGx5IHRha2VuLCBhY2V0YW1pbm9waGVuIChlLmcuIFR5bGVub2wpLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF8yNScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdSZWNlbnQgYWNldGFtaW5vcGhlbiBpbnRha2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIHJlZ3VsYXJseSB0YWtlLCBvciBoYXZlIHJlY2VudGx5IHRha2VuLCBOU0FJRFMgKGUuZy4gQWR2aWwsIEFsZXZlKSBvciBjb3J0aWNvc3Rlcm9pZHMgKGUuZy4gY29ydGlzb25lLCBwcmVkbmlzb25lKS4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfNDQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnTlNBSUQgb3IgY29ydGljb3N0ZXJvaWQgdXNlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiAnSSB1c2Ugb3IgdGFrZSBvcGlvaWQgbWVkaWNhdGlvbnMgc3VjaCBhcyBveHljb2RvbmUgKGVpdGhlciBsZWdhbGx5IG9yIGlsbGVnYWxseSkuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUmlza0ZhY3RvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdwXzQzJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ09waW9pZCB1c2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGhhdmUgcmVjZW50bHkgdGFrZW4gb3IgcmVndWxhcmx5IHRha2UgQXNwaXJpbiBvciBhbm90aGVyIHNhbGljeWxhdGUgbWVkaWNhdGlvbi4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMjYnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnU2FsaWN5bGF0ZSBpbnRha2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIHRha2Ugc2xlZXBpbmcgcGlsbHMgb3Igc2VkYXRpdmVzLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF80NScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdUYWtpbmcgc2xlZXBpbmcgcGlsbHMgb3Igc2VkYXRpdmVzJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiAnSSBoYXZlIHJlY2VudGx5IHNtb2tlZCBvciB1c2VkIGNhbm5hYmlzIChtYXJpanVhbmEpIHByb2R1Y3RzLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF82OScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdDYW5uYWJpcywgbWFyaWp1YW5hIHNtb2tpbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGZyZXF1ZW50bHkgY29uc3VtZSBhbGNvaG9sLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF8zOCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdGcmVxdWVudCBhbGNvaG9sIGNvbnN1bXB0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiAnSSBzbW9rZSB0b2JhY2NvLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF8yOCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdTbW9raW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjb25kaXRpb25zSW50ZXJ2aWV3JyxcbiAgICAgICAgICAgICAgICBwcmV0dHlOYW1lOiAnTWVkaWNhbCBDb25kaXRpb24gUmlzayBGYWN0b3JzJyxcbiAgICAgICAgICAgICAgICBhdmFpbGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgY29tcGxldGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Jpc2sgZmFjdG9ycyByZWxhdGVkIHRvIHlvdXIgbWVkaWNhbCBjb25kaXRpb25zLicsXG4gICAgICAgICAgICAgICAgcXVlc3Rpb25zOiBbe1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGhhdmUgZGlhYmV0ZXMuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUmlza0ZhY3RvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdwXzgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnRGlhYmV0ZXMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGhhdmUgaGlnaCBjaG9sZXN0ZXJvbC4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTAnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnSGlnaCBDaG9sZXN0ZXJvbCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfdHJ1ZTogJ3ByZXNlbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX2ZhbHNlOiAnYWJzZW50J1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxdWVzdGlvbjogJ0kgaGF2ZSBoaWdoIGJsb29kIHByZXNzdXJlLicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF85JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ0hpZ2ggQmxvb2QgUHJlc3N1cmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGhhdmUgaGFkIGEgaGVhcnQgYXR0YWNrIGluIHRoZSBwYXN0LicsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF84MCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdQcmlvciBIZWFydCBBdHRhY2snLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVlc3Rpb246ICdJIGhhdmUgcmVjZW50bHkgaGFkIHN1cmdlcnkuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUmlza0ZhY3RvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdwXzQ3JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ1JlY2VudCBTdXJnZXJ5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdsb2NhdGlvbkludGVydmlldycsXG4gICAgICAgICAgICAgICAgcHJldHR5TmFtZTogJ0xvY2F0aW9uLVJlbGF0ZWQgUmlzayBGYWN0b3JzJyxcbiAgICAgICAgICAgICAgICBhdmFpbGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgY29tcGxldGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Jpc2sgZmFjdG9ycyByZWxhdGVkIHRvIHBsYWNlcyB5b3VcXCd2ZSBsaXZlZCBvciB0cmF2ZWxlZC4nLFxuICAgICAgICAgICAgICAgIHByb21wdDogJ1NlbGVjdCBhbnkgcGxhY2Ugd2hlcmUgeW91IGxpdmUgb3Igd2hlcmUgeW91IGhhdmUgcmVjZW50bHkgdHJhdmVsZWQuJyxcbiAgICAgICAgICAgICAgICBxdWVzdGlvbnM6IFt7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF8xOScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdBdXN0cmFsaWEgYW5kIE9jZWFuaWEnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnQ2VudHJhbCBBZnJpY2EnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnRXVyb3BlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUmlza0ZhY3RvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdwXzE0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ0xhdGluIGFuZCBTb3V0aCBBbWVyaWNhIChpbmNsdWRpbmcgTWV4aWNvKScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfdHJ1ZTogJ3ByZXNlbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX2ZhbHNlOiAnYWJzZW50J1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF8yMScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdNaWRkbGUgRWFzdCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfdHJ1ZTogJ3ByZXNlbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX2ZhbHNlOiAnYWJzZW50J1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Jpc2tGYWN0b3I6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByaXNrRmFjdG9yRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiAncF8xMycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tbW9uX25hbWU6ICdVbml0ZWQgU3RhdGVzIGFuZCBDYW5hZGEnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTYnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnTm9ydGhlcm4gQWZyaWNhJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUmlza0ZhY3RvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdwXzIwJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ1J1c3NpYSwgS2F6YWtoc3RhbiBhbmQgTW9uZ29saWEnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmX3RydWU6ICdwcmVzZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl9mYWxzZTogJ2Fic2VudCdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNSaXNrRmFjdG9yOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmlza0ZhY3RvckRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogJ3BfMTgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbl9uYW1lOiAnU291dGhlcm4gQWZyaWNhJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUmlza0ZhY3RvcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpc2tGYWN0b3JEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICdwXzIyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21tb25fbmFtZTogJ1NvdXRod2VzdGVybiBBc2lhJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZl90cnVlOiAncHJlc2VudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWZfZmFsc2U6ICdhYnNlbnQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgcnVuKCkge1xuICAgICAgICBjb25zdCBpbnRlcnZpZXcgPSB0aGlzLmZpbmROZXh0QXZhaWxhYmxlSW50ZXJ2aWV3KCk7XG4gICAgICAgIGlmIChpbnRlcnZpZXcpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLnJlbmRlcmVyLnJ1bignbWFpbicsICdyaXNrRmFjdG9ySW50ZXJ2aWV3c19pbnRlcnZpZXctZm9ybScsIGludGVydmlldyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmFwcC5uYXYucmlza0ZhY3RvckludGVydmlld0NvbXBsZXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmaW5kTmV4dEF2YWlsYWJsZUludGVydmlldygpIHtcbiAgICAgICAgY29uc3QgaW50ZXJ2aWV3ID0gdGhpcy5pbnRlcnZpZXdzLmZpbmQoaW50ZXJ2aWV3ID0+IGludGVydmlldy5hdmFpbGFibGUgJiYgIWludGVydmlldy5jb21wbGV0ZWQpO1xuICAgICAgICByZXR1cm4gaW50ZXJ2aWV3O1xuICAgIH1cblxuICAgIGZpbmRJbnRlcnZpZXdCeU5hbWUobmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbnRlcnZpZXdzLmZpbmQoaW50ZXJ2aWV3ID0+IGludGVydmlldy5uYW1lID09PSBuYW1lKTtcbiAgICB9XG5cbiAgICBmaW5kUXVlc3Rpb25CeUlkKGludGVydmlld05hbWUsIGlkKSB7XG4gICAgICAgIGNvbnN0IGludGVydmlldyA9IHRoaXMuZmluZEludGVydmlld0J5TmFtZShpbnRlcnZpZXdOYW1lKTtcbiAgICAgICAgY29uc3QgcXVlc3Rpb24gPSBpbnRlcnZpZXcucXVlc3Rpb25zLmZpbmQocXVlc3Rpb24gPT4gcXVlc3Rpb24ucmlza0ZhY3RvckRhdGEuaWQgPT09IGlkKTtcbiAgICAgICAgcmV0dXJuIHF1ZXN0aW9uO1xuICAgIH1cblxuICAgIG1hcmtJbnRlcnZpZXdDb21wbGV0ZWQobmFtZSkge1xuICAgICAgICBjb25zdCBpbnRlcnZpZXcgPSB0aGlzLmZpbmRJbnRlcnZpZXdCeU5hbWUobmFtZSk7XG4gICAgICAgIGludGVydmlldy5jb21wbGV0ZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIG1hcmtJbnRlcnZpZXdVbmF2YWlsYWJsZShuYW1lKSB7XG4gICAgICAgIGNvbnN0IGludGVydmlldyA9IHRoaXMuZmluZEludGVydmlld0J5TmFtZShuYW1lKTtcbiAgICAgICAgaW50ZXJ2aWV3LmF2YWlsYWJsZSA9IGZhbHNlO1xuICAgIH1cblxuICAgIHByb2Nlc3NJbnRlcnZpZXdBbnN3ZXJzKCkge1xuICAgICAgICBjb25zdCBpbnRlcnZpZXdOYW1lID0gJCgnZm9ybScpLmRhdGEoJ2ludGVydmlldy1uYW1lJyk7XG4gICAgICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICQoJ2lucHV0JykuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNvbnN0IGlkID0gdGhpcy5pZDtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAkKHRoaXMpLnByb3AoJ2NoZWNrZWQnKTtcbiAgICAgICAgICAgIGlmIChpZCAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcXVlc3Rpb24gPSBzZWxmLmZpbmRRdWVzdGlvbkJ5SWQoaW50ZXJ2aWV3TmFtZSwgaWQpO1xuICAgICAgICAgICAgICAgIGlmIChxdWVzdGlvbi5pc1Jpc2tGYWN0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJlc2VuY2UgPSBjaGVja2VkID8gcXVlc3Rpb24ucmlza0ZhY3RvckRhdGEuaWZfdHJ1ZSA6IHF1ZXN0aW9uLnJpc2tGYWN0b3JEYXRhLmlmX2ZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJlc2VuY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuYXBwLnBhdGllbnQuYWRkRXZpZGVuY2UoaWQsIHByZXNlbmNlLCB0cnVlLCBxdWVzdGlvbi5yaXNrRmFjdG9yRGF0YS5jb21tb25fbmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXN0aW9uLmhhc093blByb3BlcnR5KCdkZXBlbmRlbnQnKSAmJiAhY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLm1hcmtJbnRlcnZpZXdVbmF2YWlsYWJsZShxdWVzdGlvbi5kZXBlbmRlbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubWFya0ludGVydmlld0NvbXBsZXRlZChpbnRlcnZpZXdOYW1lKTtcbiAgICAgICAgdGhpcy5ydW4oKTtcbiAgICB9XG59IiwiSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJjb25kaXRpb25cIiwgSGFuZGxlYmFycy50ZW1wbGF0ZSh7XCIxXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oY29udGFpbmVyLmxhbWJkYShkZXB0aDAsIGRlcHRoMCkpXG4gICAgKyBcIiBcIjtcbn0sXCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBhbGlhczE9Y29udGFpbmVyLmxhbWJkYSwgYWxpYXMyPWNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gXCI8ZGl2IGNsYXNzPVxcXCJjb25kaXRpb24gXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwicHJldmFsZW5jZVwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIiBcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJhY3V0ZW5lc3NcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCIgXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwic2V2ZXJpdHlcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCIgXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwidHJpYWdlX2xldmVsXCIpIDogZGVwdGgwKSwgZGVwdGgwKSlcbiAgICArIFwiIFwiXG4gICAgKyAoKHN0YWNrMSA9IGxvb2t1cFByb3BlcnR5KGhlbHBlcnMsXCJlYWNoXCIpLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiAoY29udGFpbmVyLm51bGxDb250ZXh0IHx8IHt9KSwoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJjYXRlZ29yaWVzXCIpIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJlYWNoXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDEsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGEsXCJsb2NcIjp7XCJzdGFydFwiOntcImxpbmVcIjoxLFwiY29sdW1uXCI6MTAxfSxcImVuZFwiOntcImxpbmVcIjoxLFwiY29sdW1uXCI6MTM5fX19KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiBjYXJkLXBhbmVsXFxcIlxcbiAgICBpZD1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwiaWRcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCJcXFwiXFxuICAgIDxkaXYgY2xhc3M9XFxcImNhcmQtY29udGVudFxcXCI+XFxuICAgICAgICA8c3BhbiBjbGFzcz1cXFwiY2FyZC10aXRsZVxcXCI+XCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwiY29tbW9uX25hbWVcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCI8L3NwYW4+XFxuICAgICAgICA8cCBjbGFzcz1cXFwiaW5mb1xcXCI+PHNwYW4gY2xhc3M9XFxcImxhYmVsXFxcIj5QcmV2YWxlbmNlOiA8L3NwYW4+XCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwicHJldmFsZW5jZVwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIjwvcD5cXG4gICAgICAgIDxwIGNsYXNzPVxcXCJpbmZvXFxcIj48c3BhbiBjbGFzcz1cXFwibGFiZWxcXFwiPlNldmVyaXR5OiA8L3NwYW4+XCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwic2V2ZXJpdHlcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCI8L3A+XFxuICAgICAgICA8cD48c3BhbiBjbGFzcz1cXFwibGFiZWxcXFwiPlJlY29tbWVuZGF0aW9uOiA8L3NwYW4+XCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJleHRyYXNcIikgOiBkZXB0aDApKSAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoc3RhY2sxLFwiaGludFwiKSA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIjwvcD5cXG4gICAgPC9kaXY+XFxuPC9kaXY+XCI7XG59LFwidXNlRGF0YVwiOnRydWV9KSk7XG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbChcImRpc2NsYWltZXItdGV4dFwiLCBIYW5kbGViYXJzLnRlbXBsYXRlKHtcImNvbXBpbGVyXCI6WzgsXCI+PSA0LjMuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHJldHVybiBcIjxwIGNsYXNzPVxcXCJkaXNjbGFpbWVyIGZsb3ctdGV4dFxcXCI+TWVkaWNhbCBjb250ZW50IGlzIGNvdXJ0ZXN5IG9mIHRoZSA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5pbmZlcm1lZGljYS5jb20vXFxcIiB0YXJnZXQ9XFxcIl9ibGFua1xcXCI+SW5mZXJtZWRpY2EgQVBJPC9hPiBhbmQgaXMgaW50ZW5kZWQgZm9yIGluZm9ybWF0aW9uYWwgYW5kIGVkdWNhdGlvbmFsIHB1cnBvc2VzIG9ubHkuICBJbmZvcm1hdGlvbiBhbmQgcG90ZW50aWFsIGRpYWdub3NlcyBvYnRhaW5lZCB0aHJvdWdoIHRoaXMgYXBwbGljYXRpb24gc2hvdWxkIG5vdCBiZSB0cmVhdGVkIGFzIGEgZG9jdG9yJ3MgYWR2aWNlLCBhIG1lZGljYWwgY29uc3VsdGF0aW9uLCBvciBhIGZpcm0gZGlhZ25vc2lzLiAgQWx3YXlzIHNlZSB5b3UgaGVhbHRoY2FyZSBwcm92aWRlciByZWdhcmRpbmcgYW55IG1lZGljYWwgY29uZGl0aW9ucy4gIEluZmVybWVkaWNhIGFuZCB0aGUgZGV2ZWxvcGVyIG9mIHRoaXMgYXBwbGljYXRpb24gZXhwcmVzc2x5IGRpc2NsYWltIGFsbCBsaWFiaWxpdHkgZm9yIHlvdXIgcmVsaWFuY2Ugb24gaW5mb3JtYXRpb24gZm91bmQgaW4gdGhpcyBhcHAuICBJZiB5b3UgYXJlIGV4cGVyaWVuY2luZyBhIG1lZGljYWwgZW1lcmdlbmN5LCBwbGVhc2UgY2FsbCA5MTEgb3IgdGhlIGFwcHJvcHJpYXRlIGVtZXJnZW5jeSBzZXJ2aWNlcyBudW1iZXIgaW4geW91ciBhcmVhLjwvcD5cXG5cIjtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pKTtcbkhhbmRsZWJhcnMucmVnaXN0ZXJQYXJ0aWFsKFwiZGlzY2xhaW1lclwiLCBIYW5kbGViYXJzLnRlbXBsYXRlKHtcImNvbXBpbGVyXCI6WzgsXCI+PSA0LjMuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGxvb2t1cFByb3BlcnR5ID0gY29udGFpbmVyLmxvb2t1cFByb3BlcnR5IHx8IGZ1bmN0aW9uKHBhcmVudCwgcHJvcGVydHlOYW1lKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyZW50LCBwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9O1xuXG4gIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcImZ1bm55LWRpc2NsYWltZXJcXFwiPlxcbiAgPGgyPkknbSBub3QgYSBkb2N0b3IsIEkganVzdCBwbGF5IG9uZSBvbiB0aGUgaW50ZXJuZXQuLi4uPC9oMj5cXG4gIDxwIGNsYXNzPVxcXCJmbG93LXRleHRcXFwiPlNlcmlvdXNseSBmb2xrcywgSSdtIG5vIERyLiBNZXJlZGl0aCBHcmV5LiAgSGVjaywgSSdtIG5vdCBldmVuIERyLiBQaGlsLiAgQW5kIHRoaXMgY29tcHV0ZXIgaXNuJ3QgYSBkb2N0b3IgZWl0aGVyLiAgU28geW91IGhhdmUgdG8gcHJvbWlzZSBub3QgdG8gc3VlIHVzIGlmIHdlIHRlbGwgeW91IHRoYXQgeW91IGhhdmUgYSBoYW5nbmFpbCwgYnV0IGFuIGFjdHVhbCBkb2N0b3IgZGlhZ25vc2VzIHlvdSB3aXRoIHRoZSBidWJvbmljIHBsYWd1ZS4gIDxzcGFuIGNsYXNzPVxcXCJpbXBvcnRhbnRcXFwiPlRoZSBsZWdhbGVzZSBpcyBiZWxvdywgYnV0IHRoZSBnaXN0IG9mIGl0IGlzOiBpZiB5b3UgdGhpbmsgc29tZXRoaW5nIG1pZ2h0IGJlIHdyb25nIHdpdGggeW91LCBzZWUgYSBSRUFMIGRvY3Rvci48L3NwYW4+PC9wPlxcbjwvZGl2PlxcbjxkaXYgY2xhc3M9XFxcImRpc2NsYWltZXJcXFwiPlxcblwiXG4gICAgKyAoKHN0YWNrMSA9IGNvbnRhaW5lci5pbnZva2VQYXJ0aWFsKGxvb2t1cFByb3BlcnR5KHBhcnRpYWxzLFwiZGlzY2xhaW1lci10ZXh0XCIpLGRlcHRoMCx7XCJuYW1lXCI6XCJkaXNjbGFpbWVyLXRleHRcIixcImRhdGFcIjpkYXRhLFwiaW5kZW50XCI6XCIgIFwiLFwiaGVscGVyc1wiOmhlbHBlcnMsXCJwYXJ0aWFsc1wiOnBhcnRpYWxzLFwiZGVjb3JhdG9yc1wiOmNvbnRhaW5lci5kZWNvcmF0b3JzfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCI8L2Rpdj5cXG48Zm9ybSBjbGFzcz1cXFwic3RhcnRcXFwiIGFjdGlvbj1cXFwiI1xcXCIgbWV0aG9kPVxcXCJwb3N0XFxcIj5cXG4gIDxidXR0b24gdHlwZT1cXFwic3VibWl0XFxcIiBuYW1lPVxcXCJhY2NlcHQtZGlzY2xhaW1lclxcXCIgaWQ9XFxcImFjY2VwdC1kaXNjbGFpbWVyXFxcIiBkYXRhLWNsaWNrYWJsZT1cXFwiYWNjZXB0RGlzY2xhaW1lclxcXCIgY2xhc3M9XFxcImJ0biBidG4tbGFyZ2VcXFwiPkkgUHJvbWlzZSBJIFdvbid0IFN1ZSBZb3U8L2J1dHRvbj5cXG48L2Zvcm0+XFxuXCI7XG59LFwidXNlUGFydGlhbFwiOnRydWUsXCJ1c2VEYXRhXCI6dHJ1ZX0pKTtcbkhhbmRsZWJhcnMucmVnaXN0ZXJQYXJ0aWFsKFwiZXJyb3JcIiwgSGFuZGxlYmFycy50ZW1wbGF0ZSh7XCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCI8aDI+T2ggTm8sIFNvbWV0aGluZyBXZW50IFdyb25nITwvaDI+XFxuPHA+UGxlYXNlIHRyeSBhZ2FpbiBsYXRlci4gIElmIHRoZSBwcm9ibGVtIHBlcnNpc3RzLCBwbGVhc2Ugc2VuZCBhbiBlbWFpbCB0byA8YSBocmVmPVxcXCJtYWlsdG86YW1hbmRhQGFtYW5kYXJlaWxseS5tZVxcXCI+dGhlIHdlYm1hc3RlcjwvYT4uPC9wPlxcbjxhIGhyZWY9XFxcIiNcXFwiIGlkPVxcXCJzdGFydC1vdmVyXFxcIiBkYXRhLWNsaWNrYWJsZT1cXFwic3RhcnRPdmVyXFxcIj5TdGFydCBPdmVyPC9hPlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJmb290ZXJcIiwgSGFuZGxlYmFycy50ZW1wbGF0ZSh7XCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gKChzdGFjazEgPSBjb250YWluZXIuaW52b2tlUGFydGlhbChsb29rdXBQcm9wZXJ0eShwYXJ0aWFscyxcImRpc2NsYWltZXItdGV4dFwiKSxkZXB0aDAse1wibmFtZVwiOlwiZGlzY2xhaW1lci10ZXh0XCIsXCJkYXRhXCI6ZGF0YSxcImhlbHBlcnNcIjpoZWxwZXJzLFwicGFydGlhbHNcIjpwYXJ0aWFscyxcImRlY29yYXRvcnNcIjpjb250YWluZXIuZGVjb3JhdG9yc30pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIik7XG59LFwidXNlUGFydGlhbFwiOnRydWUsXCJ1c2VEYXRhXCI6dHJ1ZX0pKTtcbkhhbmRsZWJhcnMucmVnaXN0ZXJQYXJ0aWFsKFwiaGVhZGVyLWRpc2NsYWltZXJcIiwgSGFuZGxlYmFycy50ZW1wbGF0ZSh7XCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCI8aDEgY2xhc3M9XFxcImRpc2NsYWltZXJcXFwiPkRpc2NsYWltZXI8L2gxPlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJoZWFkZXItaG9tZVwiLCBIYW5kbGViYXJzLnRlbXBsYXRlKHtcImNvbXBpbGVyXCI6WzgsXCI+PSA0LjMuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcImhlYWRlci1ncm91cFxcXCI+XFxuICAgIDxpIGNsYXNzPVxcXCJtYXRlcmlhbC1pY29ucyBsYXJnZVxcXCI+bG9jYWxfaG9zcGl0YWw8L2k+XFxuICAgIDxoMSBjbGFzcz1cXFwiaG9tZSB3aXRoLXN1YlxcXCI+SW50ZXJuZXQgTWVkaWNhbCBEaWFnbm9zaXMgRW5naW5lPC9oMT5cXG48L2Rpdj5cXG5cIjtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pKTtcbkhhbmRsZWJhcnMucmVnaXN0ZXJQYXJ0aWFsKFwiaGVhZGVyLXN5bXB0b21DaGVja2VyXCIsIEhhbmRsZWJhcnMudGVtcGxhdGUoe1wiY29tcGlsZXJcIjpbOCxcIj49IDQuMy4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiPGRpdiBjbGFzcz1cXFwiaGVhZGVyLWdyb3VwIG5vdC1ob21lXFxcIj5cXG4gIDxpIGNsYXNzPVxcXCJtYXRlcmlhbC1pY29ucyBsYXJnZVxcXCI+bG9jYWxfaG9zcGl0YWw8L2k+XFxuICA8aDEgY2xhc3M9XFxcImhvbWUgd2l0aC1zdWJcXFwiPkludGVybmV0IE1lZGljYWwgRGlhZ25vc2lzIEVuZ2luZTwvaDE+XFxuPC9kaXY+XFxuXFxuPGEgaHJlZj1cXFwiI1xcXCIgZGF0YS1jbGlja2FibGU9XFxcInN0YXJ0T3ZlclxcXCIgaWQ9XFxcInN0YXJ0LW92ZXJcXFwiIGNsYXNzPVxcXCJidG4gYnRuLWxhcmdlXFxcIj5TdGFydCBPdmVyPC9hPlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJob21lXCIsIEhhbmRsZWJhcnMudGVtcGxhdGUoe1wiY29tcGlsZXJcIjpbOCxcIj49IDQuMy4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiPGRpdiBjbGFzcz1cXFwiaW5zdHJ1Y3Rpb25zXFxcIj5cXG4gIDxwIGNsYXNzPVxcXCJmbG93LXRleHRcXFwiIHRhYmluZGV4PVxcXCIwXFxcIj5FdmVyeW9uZSBoYXMgYSBtb21lbnQgd2hlcmUgdGhleSBmZWVsIGEgdHdpbmdlLCBvciBmZWVsIGxpa2UgdGhleSBhcmUgY29taW5nIGRvd24gd2l0aCBzb21ldGhpbmcsIGJ1dCBhcmUgbm90IHN1cmUgaWYgaXQgd2FycmFudHMgYSBjYWxsIHRvIHRoZSBkb2N0b3IsIG9yIGEgdHJpcCB0byB0aGUgZW1lcmdlbmN5IHJvb20uICBUaGlzIHVzdWFsbHkgcmVzdWx0cyBpbiBhIHRyaXAgZG93biB0aGUgaW50ZXJuZXQgXFxcInJhYmJpdC1ob2xlXFxcIiBpbiBzZWFyY2ggb2YgYW5zd2Vycy4gIFdlIHRoZW4gd2FzdGUgaG91cnMgb3IgZGF5cyBjb252aW5jaW5nIG91cnNlbHZlcyB0aGF0IHdlJ3JlIGR5aW5nIG9mIHNvbWUgb2JzY3VyZSB0cm9waWNhbCBkaXNlYXNlLCB3aGVuIHdlIHJlYWxseSBqdXN0IGhhdmUgYSBjb21tb24gY29sZC48L3A+XFxuICA8cCBjbGFzcz1cXFwiZmxvdy10ZXh0XFxcIiB0YWJpbmRleD1cXFwiMFxcXCI+VGhpcyBhcHBsaWNhdGlvbiBzZWVrcyB0byBzb2x2ZSB0aGF0IHByb2JsZW0uICBVc2luZyB0aGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZXZlbG9wZXIuaW5mZXJtZWRpY2EuY29tXFxcIiB0YXJnZXQ9XFxcIl9ibGFua1xcXCI+SW5mZXJtZWRpY2EgTWVkaWNhbCBEaWFnbm9zaXMgQVBJPC9hPiwgd2Ugd2FsayB5b3UgdGhyb3VnaCBhbiBpbnRlbGxpZ2VudCBpbnRlcnZpZXcgcHJvY2VzcyB0byBwcm92aWRlIHlvdSB3aXRoIHRoZSBtb3N0IGxpa2VseSBwb3NzaWJsZSBkaWFnbm9zZXMsIGFuZCBzdWdnZXN0aW9ucyBvbiBuZXh0IHN0ZXBzLjwvcD5cXG4gIDxwIGNsYXNzPVxcXCJmbG93LXRleHRcXFwiIHRhYmluZGV4PVxcXCIwXFxcIj5DbGljayBcXFwiRGlhZ25vc2UgTWUhXFxcIiBiZWxvdyB0byBnZXQgc3RhcnRlZCE8L3A+ICBcXG48L2Rpdj5cXG48Zm9ybSBjbGFzcz1cXFwic3RhcnRcXFwiIGFjdGlvbj1cXFwiI1xcXCIgbWV0aG9kPVxcXCJwb3N0XFxcIj5cXG4gIDxidXR0b24gdHlwZT1cXFwic3VibWl0XFxcIiBuYW1lPVxcXCJkaWFnbm9zZS1tZVxcXCIgaWQ9XFxcImRpYWdub3NlLW1lXFxcIiBkYXRhLWNsaWNrYWJsZT1cXFwiZGlhZ25vc2VNZVxcXCIgY2xhc3M9XFxcImJ0biBidG4tbGFyZ2VcXFwiPkRpYWdub3NlIE1lITwvYnV0dG9uPlxcbjwvZm9ybT5cXG5cIjtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pKTtcbkhhbmRsZWJhcnMucmVnaXN0ZXJQYXJ0aWFsKFwiaW50ZXJ2aWV3LXN0YXJ0XCIsIEhhbmRsZWJhcnMudGVtcGxhdGUoe1wiY29tcGlsZXJcIjpbOCxcIj49IDQuMy4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiPGgyPkdyZWF0LCBsZXQncyBnZXQgc3RhcnRlZCE8L2gyPlxcblxcbjxmb3JtIGNsYXNzPVxcXCJpbnRlcnZpZXctc3RhcnRcXFwiIGFjdGlvbj1cXFwiI1xcXCIgbWV0aG9kPVxcXCJwb3N0XFxcIj5cXG4gIDxmaWVsZHNldD5cXG4gICAgPGxlZ2VuZD5UZWxsIE1lIEFib3V0IFlvdXJzZWxmPC9sZWdlbmQ+XFxuICAgIDx1bCBpZD1cXFwiZXJyb3JzXFxcIiBzdHlsZT1cXFwiZGlzcGxheTogbm9uZTtcXFwiPjwvdWw+XFxuICAgIDxsYWJlbCBmb3I9XFxcImZpcnN0LW5hbWVcXFwiPldoYXQgY2FuIEkgY2FsbCB5b3U/XFxuICAgIDxpbnB1dCB0eXBlPVxcXCJ0ZXh0XFxcIiBuYW1lPVxcXCJmaXJzdC1uYW1lXFxcIiBpZD1cXFwiZmlyc3QtbmFtZVxcXCJwbGFjZWhvbGRlcj1cXFwiRmlyc3QgTmFtZVxcXCIgbWlubGVuZ3RoPTIgcmVxdWlyZWQ+PC9sYWJlbD5cXG4gICAgXFxuICAgIDxsYWJlbCBmb3I9XFxcImFnZVxcXCI+SG93IG9sZCBhcmUgeW91P1xcbiAgICA8aW5wdXQgdHlwZT1cXFwibnVtYmVyXFxcIiBuYW1lPVxcXCJhZ2VcXFwiIHJlcXVpcmVkPjwvbGFiZWw+XFxuICAgIDxsYWJlbCBmb3I9XFxcImdlbmRlclxcXCI+V2hhdCBpcyB5b3VyIHNleD88L2xhYmVsPjxicj5cXG4gICAgPGxhYmVsIGZvcj1cXFwibWFsZVxcXCI+PGlucHV0IHR5cGU9XFxcInJhZGlvXFxcIiBuYW1lPVxcXCJnZW5kZXJcXFwiIHZhbHVlPVxcXCJtYWxlXFxcIiBpZD1cXFwibWFsZVxcXCIgY2xhc3M9XFxcIndpdGgtZ2FwXFxcIiByZXF1aXJlZD48c3Bhbj5NYWxlPC9zcGFuPjwvbGFiZWw+XFxuICAgIDxsYWJlbCBmb3I9XFxcImZlbWFsZVxcXCI+PGlucHV0IHR5cGU9XFxcInJhZGlvXFxcIiBuYW1lPVxcXCJnZW5kZXJcXFwiIHZhbHVlPVxcXCJmZW1hbGVcXFwiIGlkPVxcXCJmZW1hbGVcXFwiIGNsYXNzPVxcXCJ3aXRoLWdhcFxcXCIgcmVxdWlyZWQ+PHNwYW4+RmVtYWxlPC9zcGFuPjwvbGFiZWw+PGJyPlxcbiAgICA8YnV0dG9uIHR5cGU9XFxcInN1Ym1pdFxcXCIgbmFtZT1cXFwic3VibWl0XFxcIiBpZD1cXFwic3VibWl0LWludGVydmlldy1zdGFydFxcXCIgZGF0YS1jbGlja2FibGU9XFxcInN1Ym1pdEludGVydmlld1N0YXJ0XFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1sYXJnZSByaWdodFxcXCI+Q29udGludWU8L2J1dHRvbj5cXG4gIDwvZmllbGRzZXQ+XFxuPC9mb3JtPlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJsb2FkZXJcIiwgSGFuZGxlYmFycy50ZW1wbGF0ZSh7XCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCI8ZGl2IGNsYXNzPVxcXCJwcmVsb2FkZXItd3JhcHBlciBiaWcgYWN0aXZlXFxcIj5cXG4gICAgPGRpdiBjbGFzcz1cXFwic3Bpbm5lci1sYXllciBzcGlubmVyLWJsdWUtb25seVxcXCI+XFxuICAgICAgICA8ZGl2IGNsYXNzPVxcXCJjaXJjbGUtY2xpcHBlciBsZWZ0XFxcIj5cXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVxcXCJjaXJjbGVcXFwiPjwvZGl2PlxcbiAgICAgICAgPC9kaXY+XFxuICAgICAgICA8ZGl2IGNsYXNzPVxcXCJnYXAtcGF0Y2hcXFwiPlxcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XFxcImNpcmNsZVxcXCI+PC9kaXY+XFxuICAgICAgICA8L2Rpdj5cXG4gICAgICAgIDxkaXYgY2xhc3M9XFxcImNpcmNsZS1jbGlwcGVyIHJpZ2h0XFxcIj5cXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVxcXCJjaXJjbGVcXFwiPjwvZGl2PlxcbiAgICAgICAgPC9kaXY+XFxuICAgIDwvZGl2PlxcbjwvZGl2PlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJxdWVzdGlvbi1mb3JtLWdyb3VwX211bHRpcGxlXCIsIEhhbmRsZWJhcnMudGVtcGxhdGUoe1wiMVwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIGFsaWFzMT1jb250YWluZXIubGFtYmRhLCBhbGlhczI9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24sIGxvb2t1cFByb3BlcnR5ID0gY29udGFpbmVyLmxvb2t1cFByb3BlcnR5IHx8IGZ1bmN0aW9uKHBhcmVudCwgcHJvcGVydHlOYW1lKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyZW50LCBwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9O1xuXG4gIHJldHVybiBcIiAgICAgICAgPGxhYmVsIGZvcj1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwiaWRcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCJcXFwiPlxcbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVxcXCJjaGVja2JveFxcXCIgbmFtZT1cXFwiY2hvaWNlXFxcIiBpZD1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwiaWRcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCJcXFwiIGRhdGEtbmFtZT1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwibmFtZVwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCIgY2xhc3M9XFxcImNob2ljZS1ncm91cCBmaWxsZWQtaW5cXFwiPjxzcGFuPlwiXG4gICAgKyBhbGlhczIoYWxpYXMxKChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcIm5hbWVcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCI8L3NwYW4+XFxuICAgICAgICA8L2xhYmVsPjxicj5cXG5cIjtcbn0sXCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBoZWxwZXIsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IChjb250YWluZXIubnVsbENvbnRleHQgfHwge30pLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gXCI8Zm9ybSBhY3Rpb249XFxcIiNcXFwiIGlkPVxcXCJkaWFnbm9zaXMtcXVlc3Rpb25cXFwiIGRhdGEtdHlwZT1cXFwiZ3JvdXBfbXVsdGlwbGVcXFwiPlxcbiAgICA8ZmllbGRzZXQ+XFxuICAgICAgICA8bGVnZW5kPlwiXG4gICAgKyBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbigoKGhlbHBlciA9IChoZWxwZXIgPSBsb29rdXBQcm9wZXJ0eShoZWxwZXJzLFwidGV4dFwiKSB8fCAoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJ0ZXh0XCIpIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGNvbnRhaW5lci5ob29rcy5oZWxwZXJNaXNzaW5nKSwodHlwZW9mIGhlbHBlciA9PT0gXCJmdW5jdGlvblwiID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInRleHRcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhLFwibG9jXCI6e1wic3RhcnRcIjp7XCJsaW5lXCI6MyxcImNvbHVtblwiOjE2fSxcImVuZFwiOntcImxpbmVcIjozLFwiY29sdW1uXCI6MjR9fX0pIDogaGVscGVyKSkpXG4gICAgKyBcIiAoU2VsZWN0IGFsbCB0aGF0IGFwcGx5KTwvbGVnZW5kPlxcbiAgICAgICAgPHVsIGlkPVxcXCJlcnJvcnNcXFwiIHN0eWxlPVxcXCJkaXNwbGF5OiBub25lO1xcXCI+PC91bD5cXG5cIlxuICAgICsgKChzdGFjazEgPSBsb29rdXBQcm9wZXJ0eShoZWxwZXJzLFwiZWFjaFwiKS5jYWxsKGFsaWFzMSwoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJpdGVtc1wiKSA6IGRlcHRoMCkse1wibmFtZVwiOlwiZWFjaFwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhLFwibG9jXCI6e1wic3RhcnRcIjp7XCJsaW5lXCI6NSxcImNvbHVtblwiOjh9LFwiZW5kXCI6e1wibGluZVwiOjksXCJjb2x1bW5cIjoxN319fSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgICAgICAgIDxsYWJlbCBmb3I9XFxcIm5vbmVcXFwiPlxcbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVxcXCJjaGVja2JveFxcXCIgbmFtZT1cXFwiY2hvaWNlXFxcIiBpZD1cXFwibm9uZVxcXCIgdmFsdWU9XFxcIm5vbmVcXFwiIGNsYXNzPVxcXCJjaG9pY2UtZ3JvdXAgZmlsbGVkLWluXFxcIj48c3Bhbj5Ob25lIG9mIHRoZSBBYm92ZTwvc3Bhbj5cXG4gICAgICAgIDwvbGFiZWw+PGJyPlxcbiAgICAgICAgPGJ1dHRvbiB0eXBlPVxcXCJzdWJtaXRcXFwiIGlkPVxcXCJzdWJtaXQtcXVlc3Rpb24tYW5zd2VyXFxcIiBkYXRhLWNsaWNrYWJsZT1cXFwic3VibWl0UXVlc3Rpb25BbnN3ZXJcXFwiIGNsYXNzPVxcXCJidG4gcmlnaHRcXFwiPkNvbnRpbnVlPC9idXR0b24+XFxuICAgIDwvZmllbGRzZXQ+XFxuPC9mb3JtPlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJxdWVzdGlvbi1mb3JtLWdyb3VwX3NpbmdsZVwiLCBIYW5kbGViYXJzLnRlbXBsYXRlKHtcIjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBhbGlhczE9Y29udGFpbmVyLmxhbWJkYSwgYWxpYXMyPWNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gXCIgICAgICAgICAgICA8bGFiZWwgZm9yPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJpZFwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCI+XFxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVxcXCJyYWRpb1xcXCIgbmFtZT1cXFwiY2hvaWNlXFxcIiBpZD1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwiaWRcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCJcXFwiIHZhbHVlPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJpZFwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCIgZGF0YS1uYW1lPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJuYW1lXCIpIDogZGVwdGgwKSwgZGVwdGgwKSlcbiAgICArIFwiXFxcIiBjbGFzcz1cXFwiY2hvaWNlLWdyb3VwIHdpdGgtZ2FwXFxcIiByZXF1aXJlZD5cXG4gICAgICAgICAgICAgICAgPHNwYW4+XCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwibmFtZVwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIjwvc3Bhbj5cXG4gICAgICAgICAgICA8L2xhYmVsPjxicj5cXG5cIjtcbn0sXCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBoZWxwZXIsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IChjb250YWluZXIubnVsbENvbnRleHQgfHwge30pLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gXCI8Zm9ybSBhY3Rpb249XFxcIiNcXFwiIGlkPVxcXCJkaWFnbm9zaXMtcXVlc3Rpb25cXFwiIGRhdGEtdHlwZT1cXFwiZ3JvdXBfc2luZ2xlXFxcIj5cXG4gICAgPGZpZWxkc2V0PlxcbiAgICAgICAgPGxlZ2VuZD5cIlxuICAgICsgY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oKChoZWxwZXIgPSAoaGVscGVyID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcInRleHRcIikgfHwgKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwidGV4dFwiKSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBjb250YWluZXIuaG9va3MuaGVscGVyTWlzc2luZyksKHR5cGVvZiBoZWxwZXIgPT09IFwiZnVuY3Rpb25cIiA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJ0ZXh0XCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjMsXCJjb2x1bW5cIjoxNn0sXCJlbmRcIjp7XCJsaW5lXCI6MyxcImNvbHVtblwiOjI0fX19KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L2xlZ2VuZD5cXG4gICAgICAgIDx1bCBpZD1cXFwiZXJyb3JzXFxcIiBzdHlsZT1cXFwiZGlzcGxheTogbm9uZTtcXFwiPjwvdWw+XFxuXCJcbiAgICArICgoc3RhY2sxID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcImVhY2hcIikuY2FsbChhbGlhczEsKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwiaXRlbXNcIikgOiBkZXB0aDApLHtcIm5hbWVcIjpcImVhY2hcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjUsXCJjb2x1bW5cIjo4fSxcImVuZFwiOntcImxpbmVcIjoxMCxcImNvbHVtblwiOjE3fX19KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiAgICAgICAgPGxhYmVsIGZvcj1cXFwibm9uZVxcXCI+XFxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XFxcInJhZGlvXFxcIiBuYW1lPVxcXCJjaG9pY2VcXFwiIGlkPVxcXCJub25lXFxcIiB2YWx1ZT1cXFwibm9uZVxcXCIgY2xhc3M9XFxcImNob2ljZS1ncm91cCB3aXRoLWdhcFxcXCI+XFxuICAgICAgICAgICAgPHNwYW4+Tm9uZSBvZiB0aGUgQWJvdmU8L3NwYW4+XFxuICAgICAgICA8L2xhYmVsPjxicj5cXG4gICAgICAgIDxsYWJlbCBmb3I9XFxcInVua25vd25cXFwiPlxcbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVxcXCJyYWRpb1xcXCIgbmFtZT1cXFwiY2hvaWNlXFxcIiBpZD1cXFwidW5rbm93blxcXCIgdmFsdWU9XFxcInVua25vd25cXFwiIGNsYXNzPVxcXCJjaG9pY2UtZ3JvdXAgd2l0aC1nYXBcXFwiPlxcbiAgICAgICAgICAgIDxzcGFuPkkgRG9uJ3QgS25vdzwvc3Bhbj5cXG4gICAgICAgIDwvbGFiZWw+PGJyPlxcbiAgICAgICAgPGJ1dHRvbiB0eXBlPVxcXCJzdWJtaXRcXFwiIGlkPVxcXCJzdWJtaXQtcXVlc3Rpb24tYW5zd2VyXFxcIiBkYXRhLWNsaWNrYWJsZT1cXFwic3VibWl0UXVlc3Rpb25BbnN3ZXJcXFwiIGNsYXNzPVxcXCJidG4gcmlnaHRcXFwiPkNvbnRpbnVlPC9idXR0b24+XFxuICAgIDwvZmllbGRzZXQ+XFxuPC9mb3JtPlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJxdWVzdGlvbi1mb3JtLXNpbmdsZVwiLCBIYW5kbGViYXJzLnRlbXBsYXRlKHtcIjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGxvb2t1cFByb3BlcnR5ID0gY29udGFpbmVyLmxvb2t1cFByb3BlcnR5IHx8IGZ1bmN0aW9uKHBhcmVudCwgcHJvcGVydHlOYW1lKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyZW50LCBwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9O1xuXG4gIHJldHVybiAoKHN0YWNrMSA9IGxvb2t1cFByb3BlcnR5KGhlbHBlcnMsXCJlYWNoXCIpLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiAoY29udGFpbmVyLm51bGxDb250ZXh0IHx8IHt9KSwoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJjaG9pY2VzXCIpIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJlYWNoXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDIsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGEsXCJsb2NcIjp7XCJzdGFydFwiOntcImxpbmVcIjo2LFwiY29sdW1uXCI6MTJ9LFwiZW5kXCI6e1wibGluZVwiOjExLFwiY29sdW1uXCI6MjF9fX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIik7XG59LFwiMlwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIGFsaWFzMT1jb250YWluZXIubGFtYmRhLCBhbGlhczI9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24sIGxvb2t1cFByb3BlcnR5ID0gY29udGFpbmVyLmxvb2t1cFByb3BlcnR5IHx8IGZ1bmN0aW9uKHBhcmVudCwgcHJvcGVydHlOYW1lKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyZW50LCBwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9O1xuXG4gIHJldHVybiBcIiAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJpZFwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCI+XFxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cXFwicmFkaW9cXFwiIG5hbWU9XFxcImNob2ljZVxcXCIgaWQ9XFxcIlwiXG4gICAgKyBhbGlhczIoYWxpYXMxKChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcImlkXCIpIDogZGVwdGgwKSwgZGVwdGgwKSlcbiAgICArIFwiXFxcIiB2YWx1ZSA9XFxcIlwiXG4gICAgKyBhbGlhczIoYWxpYXMxKChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcImlkXCIpIDogZGVwdGgwKSwgZGVwdGgwKSlcbiAgICArIFwiXFxcIiByZXF1aXJlZCBjbGFzcz1cXFwiY2hvaWNlLWdyb3VwIHdpdGgtZ2FwXFxcIj5cXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPlwiXG4gICAgKyBhbGlhczIoYWxpYXMxKChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcImxhYmVsXCIpIDogZGVwdGgwKSwgZGVwdGgwKSlcbiAgICArIFwiPC9zcGFuPlxcbiAgICAgICAgICAgICAgICA8L2xhYmVsPjxicj5cXG5cIjtcbn0sXCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBoZWxwZXIsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IChjb250YWluZXIubnVsbENvbnRleHQgfHwge30pLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gXCI8Zm9ybSBhY3Rpb249XFxcIiNcXFwiIGlkPVxcXCJkaWFnbm9zaXMtcXVlc3Rpb25cXFwiIGRhdGEtdHlwZT1cXFwic2luZ2xlXFxcIj5cXG4gICAgPGZpZWxkc2V0PlxcbiAgICAgICAgPGxlZ2VuZD5cIlxuICAgICsgY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oKChoZWxwZXIgPSAoaGVscGVyID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcInRleHRcIikgfHwgKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwidGV4dFwiKSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBjb250YWluZXIuaG9va3MuaGVscGVyTWlzc2luZyksKHR5cGVvZiBoZWxwZXIgPT09IFwiZnVuY3Rpb25cIiA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJ0ZXh0XCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjMsXCJjb2x1bW5cIjoxNn0sXCJlbmRcIjp7XCJsaW5lXCI6MyxcImNvbHVtblwiOjI0fX19KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L2xlZ2VuZD5cXG4gICAgICAgIDx1bCBpZD1cXFwiZXJyb3JzXFxcIiBzdHlsZT1cXFwiZGlzcGxheTogbm9uZTtcXFwiPjwvdWw+XFxuXCJcbiAgICArICgoc3RhY2sxID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcImVhY2hcIikuY2FsbChhbGlhczEsKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwiaXRlbXNcIikgOiBkZXB0aDApLHtcIm5hbWVcIjpcImVhY2hcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjUsXCJjb2x1bW5cIjo4fSxcImVuZFwiOntcImxpbmVcIjoxMixcImNvbHVtblwiOjE3fX19KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiAgICAgICAgPGJ1dHRvbiB0eXBlPVxcXCJzdWJtaXRcXFwiIGlkPVxcXCJzdWJtaXQtcXVlc3Rpb24tYW5zd2VyXFxcIiBkYXRhLWNsaWNrYWJsZT1cXFwic3VibWl0UXVlc3Rpb25BbnN3ZXJcXFwiIGNsYXNzPVxcXCJidG4gcmlnaHRcXFwiPkNvbnRpbnVlPC9idXR0b24+XFxuICAgIDwvZmllbGRzZXQ+XFxuPC9mb3JtPlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJyaXNrLWZhY3Rvci1pbnRyb1wiLCBIYW5kbGViYXJzLnRlbXBsYXRlKHtcImNvbXBpbGVyXCI6WzgsXCI+PSA0LjMuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBoZWxwZXIsIGxvb2t1cFByb3BlcnR5ID0gY29udGFpbmVyLmxvb2t1cFByb3BlcnR5IHx8IGZ1bmN0aW9uKHBhcmVudCwgcHJvcGVydHlOYW1lKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyZW50LCBwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9O1xuXG4gIHJldHVybiBcIjxoMj5UaGFua3MgZm9yIHRoYXQgaW5mb3JtYXRpb24sIFwiXG4gICAgKyBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbigoKGhlbHBlciA9IChoZWxwZXIgPSBsb29rdXBQcm9wZXJ0eShoZWxwZXJzLFwibmFtZVwiKSB8fCAoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJuYW1lXCIpIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGNvbnRhaW5lci5ob29rcy5oZWxwZXJNaXNzaW5nKSwodHlwZW9mIGhlbHBlciA9PT0gXCJmdW5jdGlvblwiID8gaGVscGVyLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiAoY29udGFpbmVyLm51bGxDb250ZXh0IHx8IHt9KSx7XCJuYW1lXCI6XCJuYW1lXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjEsXCJjb2x1bW5cIjozM30sXCJlbmRcIjp7XCJsaW5lXCI6MSxcImNvbHVtblwiOjQxfX19KSA6IGhlbHBlcikpKVxuICAgICsgXCIuPC9oMj5cXG48cD5UaGUgbmV4dCBmZXcgc2NyZWVucyB3aWxsIGFzayB5b3UgYWJvdXQgc29tZSBjb21tb24gcmlzayBmYWN0b3JzLiAgQ2hlY2sgYW55IHRoYXQgYXBwbHkgdG8geW91LiAgVGhpcyB3aWxsIGhlbHAgbWUgbWFrZSBhIG1vcmUgYWNjdXJhdGUgZGlhZ25vc2lzLjwvcD5cXG48YnV0dG9uIHR5cGU9XFxcInN1Ym1pdFxcXCIgaWQ9XFxcInJ1bi1yaXNrLWZhY3Rvci1pbnRlcnZpZXdcXFwiIGRhdGEtY2xpY2thYmxlPVxcXCJydW5SaXNrRmFjdG9ySW50ZXJ2aWV3XFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1sYXJnZSByaWdodFxcXCI+Q29udGludWU8L2J1dHRvbj5cXG48ZGl2IGNsYXNzPVxcXCJjbGVhcmZpeFxcXCI+PC9kaXY+XCI7XG59LFwidXNlRGF0YVwiOnRydWV9KSk7XG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbChcInJpc2stZmFjdG9yLXJhZGlvLWdyb3VwXCIsIEhhbmRsZWJhcnMudGVtcGxhdGUoe1wiY29tcGlsZXJcIjpbOCxcIj49IDQuMy4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIGFsaWFzMT1jb250YWluZXIubGFtYmRhLCBhbGlhczI9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24sIGxvb2t1cFByb3BlcnR5ID0gY29udGFpbmVyLmxvb2t1cFByb3BlcnR5IHx8IGZ1bmN0aW9uKHBhcmVudCwgcHJvcGVydHlOYW1lKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyZW50LCBwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9O1xuXG4gIHJldHVybiBcIjxsYWJlbCBmb3I9XFxcIlwiXG4gICAgKyBhbGlhczIoYWxpYXMxKChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcImlkXCIpIDogZGVwdGgwKSwgZGVwdGgwKSlcbiAgICArIFwiLXllc1xcXCI+WWVzXFxuICAgIDxpbnB1dCB0eXBlPVxcXCJyYWRpb1xcXCIgbmFtZT1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwiY29tbW9uX25hbWVcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCJcXFwiIGlkPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJpZFwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIi15ZXNcXFwiIHZhbHVlPVxcXCJZZXNcXFwiIGNsYXNzPVxcXCJyaXNrLWZhY3RvclxcXCI+XFxuPC9sYWJlbD5cXG48bGFiZWwgZm9yPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJpZFwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIi1ub1xcXCI+Tm9cXG4gICAgPGlucHV0IHR5cGU9XFxcInJhZGlvXFxcIiBuYW1lPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJjb21tb25fbmFtZVwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCIgaWQ9XFxcIlwiXG4gICAgKyBhbGlhczIoYWxpYXMxKChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcImlkXCIpIDogZGVwdGgwKSwgZGVwdGgwKSlcbiAgICArIFwiLW5vXFxcIiB2YWx1ZT1cXFwiTm9cXFwiIGNsYXNzPVxcXCJyaXNrLWZhY3RvclxcXCI+XFxuPC9sYWJlbD5cXG48YnI+XCI7XG59LFwidXNlRGF0YVwiOnRydWV9KSk7XG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbChcInNob3ctY29uZGl0aW9uc1wiLCBIYW5kbGViYXJzLnRlbXBsYXRlKHtcIjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGxvb2t1cFByb3BlcnR5ID0gY29udGFpbmVyLmxvb2t1cFByb3BlcnR5IHx8IGZ1bmN0aW9uKHBhcmVudCwgcHJvcGVydHlOYW1lKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyZW50LCBwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9O1xuXG4gIHJldHVybiAoKHN0YWNrMSA9IGNvbnRhaW5lci5pbnZva2VQYXJ0aWFsKGxvb2t1cFByb3BlcnR5KHBhcnRpYWxzLFwiY29uZGl0aW9uXCIpLGRlcHRoMCx7XCJuYW1lXCI6XCJjb25kaXRpb25cIixcImRhdGFcIjpkYXRhLFwiaW5kZW50XCI6XCIgICAgICAgICAgICBcIixcImhlbHBlcnNcIjpoZWxwZXJzLFwicGFydGlhbHNcIjpwYXJ0aWFscyxcImRlY29yYXRvcnNcIjpjb250YWluZXIuZGVjb3JhdG9yc30pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIik7XG59LFwiY29tcGlsZXJcIjpbOCxcIj49IDQuMy4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgbG9va3VwUHJvcGVydHkgPSBjb250YWluZXIubG9va3VwUHJvcGVydHkgfHwgZnVuY3Rpb24ocGFyZW50LCBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJlbnQsIHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gcGFyZW50W3Byb3BlcnR5TmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH07XG5cbiAgcmV0dXJuIFwiXFxuICAgIDxoMj5Qb3NzaWJsZSBDb25kaXRpb25zPC9oMj5cXG4gICAgPHA+QmFzZWQgb24gdGhlIGluZm9ybWF0aW9uIHlvdSBoYXZlIHByb3ZpZGVkIHVzLCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIHBvc3NpYmxlIG1hdGNoZXMgZm9yIHlvdXIgc3ltcHRvbXM6PC9wPlxcbiAgICA8ZGl2IGNsYXNzPVxcXCJjYXJkLWNvbnRhaW5lclxcXCI+XFxuXCJcbiAgICArICgoc3RhY2sxID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcImVhY2hcIikuY2FsbChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IChjb250YWluZXIubnVsbENvbnRleHQgfHwge30pLChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcImNvbmRpdGlvbnNcIikgOiBkZXB0aDApLHtcIm5hbWVcIjpcImVhY2hcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjUsXCJjb2x1bW5cIjo4fSxcImVuZFwiOntcImxpbmVcIjo3LFwiY29sdW1uXCI6MTd9fX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiICAgIDwvZGl2PlwiO1xufSxcInVzZVBhcnRpYWxcIjp0cnVlLFwidXNlRGF0YVwiOnRydWV9KSk7XG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbChcInN5bXB0b20taW50ZXJ2aWV3XCIsIEhhbmRsZWJhcnMudGVtcGxhdGUoe1wiY29tcGlsZXJcIjpbOCxcIj49IDQuMy4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIGhlbHBlciwgbG9va3VwUHJvcGVydHkgPSBjb250YWluZXIubG9va3VwUHJvcGVydHkgfHwgZnVuY3Rpb24ocGFyZW50LCBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJlbnQsIHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gcGFyZW50W3Byb3BlcnR5TmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH07XG5cbiAgcmV0dXJuIFwiPGgyPkhlbGxvLCBcIlxuICAgICsgY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oKChoZWxwZXIgPSAoaGVscGVyID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcIm5hbWVcIikgfHwgKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwibmFtZVwiKSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBjb250YWluZXIuaG9va3MuaGVscGVyTWlzc2luZyksKHR5cGVvZiBoZWxwZXIgPT09IFwiZnVuY3Rpb25cIiA/IGhlbHBlci5jYWxsKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDogKGNvbnRhaW5lci5udWxsQ29udGV4dCB8fCB7fSkse1wibmFtZVwiOlwibmFtZVwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGEsXCJsb2NcIjp7XCJzdGFydFwiOntcImxpbmVcIjoxLFwiY29sdW1uXCI6MTF9LFwiZW5kXCI6e1wibGluZVwiOjEsXCJjb2x1bW5cIjoxOX19fSkgOiBoZWxwZXIpKSlcbiAgICArIFwiITwvaDI+XFxuPGZvcm0gY2xhc3M9XFxcInN5bXB0b20tZW50cnlcXFwiIGFjdGlvbj1cXFwiI1xcXCIgbWV0aG9kPVxcXCJwb3N0XFxcIj5cXG4gIDxsYWJlbCBmb3I9XFxcImVudGVyLXN5bXB0b21zXFxcIiBjbGFzcz1cXFwiZmxvdy10ZXh0XFxcIj5UZWxsIG1lIGEgbGl0dGxlIGJpdCBhYm91dCB5b3VyIHN5bXB0b21zLiAgRG9uJ3Qgd29ycnkgYWJvdXQgdXNpbmcgZmFuY3kgbWVkaWNhbCB3b3JkcyBpZiB5b3UgZG9uJ3Qga25vdyB0aGVtIC0gSSBjYW4gdW5kZXJzdGFuZCBiYXNpYyBuYXR1cmFsIGxhbmd1YWdlLiAgSG93ZXZlciwgeW91IHNob3VsZCBiZSBhcyBzcGVjaWZpYyBhcyBwb3NzaWJsZS4gIFRoZSBwaHJhc2UgXFxcIkkgZmVlbCBzaWNrXFxcIiBtYXkgYmUgdG9vIGdlbmVyaWMsIGJ1dCBcXFwibXkgc3RvbWFjaCBpcyB1cHNldFxcXCIgb3IgXFxcIkkgZmVlbCBsaWtlIHZvbWl0aW5nXFxcIiB3aWxsIGdldCB5b3UgYmV0dGVyIHJlc3VsdHMuPC9sYWJlbD48YnI+XFxuICA8dWwgaWQ9XFxcImVycm9yc1xcXCIgc3R5bGU9XFxcImRpc3BsYXk6IG5vbmU7XFxcIj48L3VsPlxcbiAgPHRleHRhcmVhIG5hbWU9XFxcImVudGVyLXN5bXB0b21zXFxcIiBwbGFjZWhvbGRlcj1cXFwiRW50ZXIgc3ltcHRvbXNcXFwiIGlkPVxcXCJlbnRlci1zeW1wdG9tc1xcXCIgcmVxdWlyZWQ+PC90ZXh0YXJlYT48YnI+XFxuICA8YnV0dG9uIHR5cGU9XFxcInN1Ym1pdFxcXCIgbmFtZT1cXFwic3VibWl0LXN5bXB0b21zXFxcIiBpZD1cXFwic3VibWl0LXN5bXB0b21zXFxcIiBkYXRhLWNsaWNrYWJsZT1cXFwic3VibWl0U3ltcHRvbXNcXFwiIGNsYXNzPVxcXCJidG4gYnRuLWxhcmdlXFxcIj5TdWJtaXQgU3ltcHRvbXM8L2J1dHRvbj5cXG48L2Zvcm0+XFxuXCI7XG59LFwidXNlRGF0YVwiOnRydWV9KSk7XG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbChcInN5bXB0b20tbWF0Y2hlci1mb3JtXCIsIEhhbmRsZWJhcnMudGVtcGxhdGUoe1wiMVwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIGFsaWFzMT1jb250YWluZXIubGFtYmRhLCBhbGlhczI9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24sIGxvb2t1cFByb3BlcnR5ID0gY29udGFpbmVyLmxvb2t1cFByb3BlcnR5IHx8IGZ1bmN0aW9uKHBhcmVudCwgcHJvcGVydHlOYW1lKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyZW50LCBwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9O1xuXG4gIHJldHVybiBcIiAgICAgICAgICAgIDxsYWJlbCBmb3I9XFxcIlwiXG4gICAgKyBhbGlhczIoYWxpYXMxKChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcImlkXCIpIDogZGVwdGgwKSwgZGVwdGgwKSlcbiAgICArIFwiXFxcIj48aW5wdXQgdHlwZT1cXFwiY2hlY2tib3hcXFwiIG5hbWU9XFxcInN5bXB0b21cXFwiIGlkPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJpZFwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCIgY2xhc3M9XFxcInN5bXB0b20tZ3JvdXAgZmlsbGVkLWluIGluZGlnbyBkYXJrZW4tNFxcXCIgZGF0YS1uYW1lPVxcXCJcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJsYWJlbFwiKSA6IGRlcHRoMCksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCI+PHNwYW4+XCJcbiAgICArIGFsaWFzMihhbGlhczEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwibGFiZWxcIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCI8L3NwYW4+PC9sYWJlbD48YnI+XFxuXCI7XG59LFwiM1wiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiICAgICAgICAgICAgPHAgY2xhc3M9XFxcImVtcHR5XFxcIj5Ob3RoaW5nIGZvdW5kLjwvcD5cXG5cIjtcbn0sXCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gXCI8Zm9ybSBhY3Rpb249XFxcIiNcXFwiIGNsYXNzPVxcXCJzeW1wdG9tLW1hdGNoZXJcXFwiPlxcbiAgICA8aDM+WW91IHNhaWQ6IFxcXCJcIlxuICAgICsgY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9ICgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwicGFyYW1zXCIpIDogZGVwdGgwKSkgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KHN0YWNrMSxcInBhcnNlRGF0YVwiKSA6IHN0YWNrMSkpICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShzdGFjazEsXCJvcnRoXCIpIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiXFxcIjwvaDM+XFxuICAgIDxmaWVsZHNldD5cXG4gICAgICAgIDxsZWdlbmQ+Q2hlY2sgdGhlIHN5bXB0b21zIHRoYXQgbWF0Y2ggeW91ciBlbnRyeSBhYm92ZTo8L2xlZ2VuZD5cXG4gICAgICAgIDx1bCBpZD1cXFwiZXJyb3JzXFxcIiBzdHlsZT1cXFwiZGlzcGxheTogbm9uZTtcXFwiPjwvdWw+XFxuXCJcbiAgICArICgoc3RhY2sxID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcImVhY2hcIikuY2FsbChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IChjb250YWluZXIubnVsbENvbnRleHQgfHwge30pLChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcImRhdGFcIikgOiBkZXB0aDApLHtcIm5hbWVcIjpcImVhY2hcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLnByb2dyYW0oMywgZGF0YSwgMCksXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjYsXCJjb2x1bW5cIjo4fSxcImVuZFwiOntcImxpbmVcIjoxMCxcImNvbHVtblwiOjE3fX19KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiAgICAgICAgXFxuICAgICAgICA8ZGl2IGNsYXNzPVxcXCJidG4tY29udGFpbmVyIHJpZ2h0XFxcIj5cXG4gICAgICAgICAgICA8YnV0dG9uIHR5cGU9XFxcInN1Ym1pdFxcXCIgaWQ9XFxcInN1Ym1pdC1zeW1wdG9tLW1hdGNoZXJcXFwiIGRhdGEtY2xpY2thYmxlPVxcXCJzdWJtaXRTeW1wdG9tTWF0Y2hlclxcXCIgY2xhc3M9XFxcImJ0biBidG4tbGFyZ2VcXFwiPkNvbnRpbnVlPC9idXR0b24+XFxuICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVxcXCJyZXNldFxcXCIgaWQ9XFxcInN5bXB0b21zLXRyeS1hZ2FpblxcXCIgZGF0YS1jbGlja2FibGU9XFxcInN5bXB0b21zVHJ5QWdhaW5cXFwiIGNsYXNzPVxcXCJidG4gYnRuLWxhcmdlIG5lZ2F0aXZlXFxcIj5UaGF0J3Mgbm90IHdoYXQgSSBtZWFudC4gVHJ5IGFnYWluLjwvYnV0dG9uPjxicj5cXG4gICAgICAgIDwvZGl2PlxcbiAgICAgICAgXFxuICAgIDwvZmllbGRzZXQ+XFxuPC9mb3JtPlwiO1xufSxcInVzZURhdGFcIjp0cnVlfSkpO1xuSGFuZGxlYmFycy5yZWdpc3RlclBhcnRpYWwoXCJzeW1wdG9tLW1hdGNoZXJcIiwgSGFuZGxlYmFycy50ZW1wbGF0ZSh7XCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gKChzdGFjazEgPSBjb250YWluZXIuaW52b2tlUGFydGlhbChsb29rdXBQcm9wZXJ0eShwYXJ0aWFscyxcInN5bXB0b20tbWF0Y2hlci1mb3JtXCIpLGRlcHRoMCx7XCJuYW1lXCI6XCJzeW1wdG9tLW1hdGNoZXItZm9ybVwiLFwiZGF0YVwiOmRhdGEsXCJoZWxwZXJzXCI6aGVscGVycyxcInBhcnRpYWxzXCI6cGFydGlhbHMsXCJkZWNvcmF0b3JzXCI6Y29udGFpbmVyLmRlY29yYXRvcnN9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpO1xufSxcInVzZVBhcnRpYWxcIjp0cnVlLFwidXNlRGF0YVwiOnRydWV9KSk7XG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbChcInJpc2tGYWN0b3JJbnRlcnZpZXdzX2ludGVydmlldy1mb3JtXCIsIEhhbmRsZWJhcnMudGVtcGxhdGUoe1wiMVwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIGhlbHBlciwgbG9va3VwUHJvcGVydHkgPSBjb250YWluZXIubG9va3VwUHJvcGVydHkgfHwgZnVuY3Rpb24ocGFyZW50LCBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJlbnQsIHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gcGFyZW50W3Byb3BlcnR5TmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH07XG5cbiAgcmV0dXJuIFwiICAgICAgICAgICAgPGxlZ2VuZD5cIlxuICAgICsgY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oKChoZWxwZXIgPSAoaGVscGVyID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcInByZXR0eU5hbWVcIikgfHwgKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwicHJldHR5TmFtZVwiKSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBjb250YWluZXIuaG9va3MuaGVscGVyTWlzc2luZyksKHR5cGVvZiBoZWxwZXIgPT09IFwiZnVuY3Rpb25cIiA/IGhlbHBlci5jYWxsKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDogKGNvbnRhaW5lci5udWxsQ29udGV4dCB8fCB7fSkse1wibmFtZVwiOlwicHJldHR5TmFtZVwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGEsXCJsb2NcIjp7XCJzdGFydFwiOntcImxpbmVcIjo1LFwiY29sdW1uXCI6MjB9LFwiZW5kXCI6e1wibGluZVwiOjUsXCJjb2x1bW5cIjozNH19fSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC9sZWdlbmQ+XFxuXCI7XG59LFwiM1wiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgbG9va3VwUHJvcGVydHkgPSBjb250YWluZXIubG9va3VwUHJvcGVydHkgfHwgZnVuY3Rpb24ocGFyZW50LCBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJlbnQsIHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gcGFyZW50W3Byb3BlcnR5TmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH07XG5cbiAgcmV0dXJuICgoc3RhY2sxID0gY29udGFpbmVyLmludm9rZVBhcnRpYWwobG9va3VwUHJvcGVydHkocGFydGlhbHMsXCJyaXNrRmFjdG9ySW50ZXJ2aWV3c19pbnRlcnZpZXctcXVlc3Rpb25cIiksZGVwdGgwLHtcIm5hbWVcIjpcInJpc2tGYWN0b3JJbnRlcnZpZXdzX2ludGVydmlldy1xdWVzdGlvblwiLFwiZGF0YVwiOmRhdGEsXCJpbmRlbnRcIjpcIiAgICAgICAgICAgIFwiLFwiaGVscGVyc1wiOmhlbHBlcnMsXCJwYXJ0aWFsc1wiOnBhcnRpYWxzLFwiZGVjb3JhdG9yc1wiOmNvbnRhaW5lci5kZWNvcmF0b3JzfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKTtcbn0sXCJjb21waWxlclwiOls4LFwiPj0gNC4zLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBoZWxwZXIsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IChjb250YWluZXIubnVsbENvbnRleHQgfHwge30pLCBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gXCI8aDI+UmlzayBGYWN0b3JzPC9oMj5cXG48Zm9ybSBhY3Rpb249XFxcIiNcXFwiIGRhdGEtaW50ZXJ2aWV3LW5hbWU9XFxcIlwiXG4gICAgKyBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbigoKGhlbHBlciA9IChoZWxwZXIgPSBsb29rdXBQcm9wZXJ0eShoZWxwZXJzLFwibmFtZVwiKSB8fCAoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJuYW1lXCIpIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGNvbnRhaW5lci5ob29rcy5oZWxwZXJNaXNzaW5nKSwodHlwZW9mIGhlbHBlciA9PT0gXCJmdW5jdGlvblwiID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcIm5hbWVcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhLFwibG9jXCI6e1wic3RhcnRcIjp7XCJsaW5lXCI6MixcImNvbHVtblwiOjM4fSxcImVuZFwiOntcImxpbmVcIjoyLFwiY29sdW1uXCI6NDZ9fX0pIDogaGVscGVyKSkpXG4gICAgKyBcIlxcXCI+XFxuICAgIDxmaWVsZHNldD5cXG5cIlxuICAgICsgKChzdGFjazEgPSBsb29rdXBQcm9wZXJ0eShoZWxwZXJzLFwiaWZcIikuY2FsbChhbGlhczEsKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwicHJldHR5TmFtZVwiKSA6IGRlcHRoMCkse1wibmFtZVwiOlwiaWZcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjQsXCJjb2x1bW5cIjo4fSxcImVuZFwiOntcImxpbmVcIjo2LFwiY29sdW1uXCI6MTV9fX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiICAgICAgICA8cD5TZWxlY3QgZWFjaCBzdGF0ZW1lbnQgdGhhdCBhcHBsaWVzIHRvIHlvdS48L3A+XFxuICAgICAgICA8dWwgaWQ9XFxcImVycm9yc1xcXCIgc3R5bGU9XFxcImRpc3BsYXk6IG5vbmU7XFxcIj48L3VsPlxcblwiXG4gICAgKyAoKHN0YWNrMSA9IGxvb2t1cFByb3BlcnR5KGhlbHBlcnMsXCJlYWNoXCIpLmNhbGwoYWxpYXMxLChkZXB0aDAgIT0gbnVsbCA/IGxvb2t1cFByb3BlcnR5KGRlcHRoMCxcInF1ZXN0aW9uc1wiKSA6IGRlcHRoMCkse1wibmFtZVwiOlwiZWFjaFwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgzLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhLFwibG9jXCI6e1wic3RhcnRcIjp7XCJsaW5lXCI6OSxcImNvbHVtblwiOjh9LFwiZW5kXCI6e1wibGluZVwiOjExLFwiY29sdW1uXCI6MTd9fX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiICAgICAgICA8bGFiZWwgZm9yPVxcXCJub25lXFxcIj5cXG4gICAgICAgICAgICA8aW5wdXQgdHlwZT1cXFwiY2hlY2tib3hcXFwiIG5hbWU9XFxcImNob2ljZVxcXCIgaWQ9XFxcIm5vbmVcXFwiIGNsYXNzPVxcXCJyaXNrLWZhY3Rvci1ncm91cCBmaWxsZWQtaW5cXFwiIGRhdGEtbm9uZT10cnVlIGRhdGEtZ3JvdXA9XFxcInJpc2stZmFjdG9yLWdyb3VwXFxcIj5cXG4gICAgICAgICAgICA8c3Bhbj5Ob25lPC9zcGFuPlxcbiAgICAgICAgPC9sYWJlbD48YnI+XFxuICAgICAgICA8YnV0dG9uIHR5cGU9XFxcInN1Ym1pdFxcXCIgaWQ9XFxcInN1Ym1pdC1yaXNrLWZhY3RvcnNcXFwiIGRhdGEtY2xpY2thYmxlPVxcXCJzdWJtaXRSaXNrRmFjdG9yc1xcXCIgY2xhc3M9XFxcImJ0biBidG4tbGFyZ2UgcmlnaHRcXFwiPkNvbnRpbnVlPC9idXR0b24+XFxuICAgIDwvZmllbGRzZXQ+XFxuPC9mb3JtPlwiO1xufSxcInVzZVBhcnRpYWxcIjp0cnVlLFwidXNlRGF0YVwiOnRydWV9KSk7XG5IYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbChcInJpc2tGYWN0b3JJbnRlcnZpZXdzX2ludGVydmlldy1xdWVzdGlvblwiLCBIYW5kbGViYXJzLnRlbXBsYXRlKHtcIjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBsb29rdXBQcm9wZXJ0eSA9IGNvbnRhaW5lci5sb29rdXBQcm9wZXJ0eSB8fCBmdW5jdGlvbihwYXJlbnQsIHByb3BlcnR5TmFtZSkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgIHJldHVybiBwYXJlbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfTtcblxuICByZXR1cm4gXCIgXCJcbiAgICArIGNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uKGNvbnRhaW5lci5sYW1iZGEoKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwicXVlc3Rpb25cIikgOiBkZXB0aDApLCBkZXB0aDApKVxuICAgICsgXCIgXCI7XG59LFwiM1wiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgbG9va3VwUHJvcGVydHkgPSBjb250YWluZXIubG9va3VwUHJvcGVydHkgfHwgZnVuY3Rpb24ocGFyZW50LCBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJlbnQsIHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gcGFyZW50W3Byb3BlcnR5TmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH07XG5cbiAgcmV0dXJuIFwiIFwiXG4gICAgKyBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoZGVwdGgwLFwicmlza0ZhY3RvckRhdGFcIikgOiBkZXB0aDApKSAhPSBudWxsID8gbG9va3VwUHJvcGVydHkoc3RhY2sxLFwiY29tbW9uX25hbWVcIikgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCIgXCI7XG59LFwiY29tcGlsZXJcIjpbOCxcIj49IDQuMy4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgYWxpYXMxPWNvbnRhaW5lci5sYW1iZGEsIGFsaWFzMj1jb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbiwgbG9va3VwUHJvcGVydHkgPSBjb250YWluZXIubG9va3VwUHJvcGVydHkgfHwgZnVuY3Rpb24ocGFyZW50LCBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJlbnQsIHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gcGFyZW50W3Byb3BlcnR5TmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH07XG5cbiAgcmV0dXJuIFwiPGxhYmVsIGZvcj1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJyaXNrRmFjdG9yRGF0YVwiKSA6IGRlcHRoMCkpICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShzdGFjazEsXCJpZFwiKSA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCI+XFxuICAgIDxpbnB1dCB0eXBlPVxcXCJjaGVja2JveFxcXCIgbmFtZT1cXFwiY2hvaWNlXFxcIiBpZD1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJyaXNrRmFjdG9yRGF0YVwiKSA6IGRlcHRoMCkpICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShzdGFjazEsXCJpZFwiKSA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCIgY2xhc3M9XFxcInJpc2stZmFjdG9yLWdyb3VwIGZpbGxlZC1pblxcXCIgZGF0YS1ncm91cD1cXFwicmlzay1mYWN0b3ItZ3JvdXBcXFwiIGRhdGEtbmFtZT1cXFwiXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJyaXNrRmFjdG9yRGF0YVwiKSA6IGRlcHRoMCkpICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShzdGFjazEsXCJjb21tb25fbmFtZVwiKSA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCI+XFxuICAgIDxzcGFuPlxcbiAgICAgICAgXCJcbiAgICArICgoc3RhY2sxID0gbG9va3VwUHJvcGVydHkoaGVscGVycyxcImlmXCIpLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiAoY29udGFpbmVyLm51bGxDb250ZXh0IHx8IHt9KSwoZGVwdGgwICE9IG51bGwgPyBsb29rdXBQcm9wZXJ0eShkZXB0aDAsXCJxdWVzdGlvblwiKSA6IGRlcHRoMCkse1wibmFtZVwiOlwiaWZcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLnByb2dyYW0oMywgZGF0YSwgMCksXCJkYXRhXCI6ZGF0YSxcImxvY1wiOntcInN0YXJ0XCI6e1wibGluZVwiOjQsXCJjb2x1bW5cIjo4fSxcImVuZFwiOntcImxpbmVcIjo0LFwiY29sdW1uXCI6MTAwfX19KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIlxcbiAgICA8L3NwYW4+XFxuPC9sYWJlbD48YnI+XCI7XG59LFwidXNlRGF0YVwiOnRydWV9KSk7IiwiZnVuY3Rpb24gbWFpbkNvbnRyb2xsZXIoKSB7XG4gICAgY29uc3QgYXBwID0gbmV3IEFwcCgpO1xuICAgIC8vcmVuZGVyIHRoZSBob21lIHBhZ2VcbiAgICBhcHAucmVuZGVyZXIucnVuKCdoZWFkZXInLCAnaGVhZGVyLWhvbWUnKTtcbiAgICBhcHAucmVuZGVyZXIucnVuKCdtYWluJywgJ2hvbWUnKTtcbiAgICAvL2xpc3RlbiBmb3IgY2xpY2tzIFxuICAgICQoJyNtYWluLWNvbnRhaW5lcicpLm9uKCdjbGljaycsICdbZGF0YS1jbGlja2FibGVdJywgZnVuY3Rpb24oZSkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGFwcC5uYXYucnVuKGUpO1xuICAgIH0pO1xufVxuJChtYWluQ29udHJvbGxlcik7Il19
