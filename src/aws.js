const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

const runnerVersion = '2.283.2'

// User data scripts are run as the root user
function buildUserDataScript(githubRegistrationToken, label) {
  const userData = [];

  if (config.input.ec2BaseOs === 'win-x64') {
    userData.push(
      '<powershell>',
    );

    if (config.input.runnerHomeDir) {
      userData.push(
        `cd "${config.input.runnerHomeDir}"`,
      );
    } else {
      userData.push(
        'mkdir c:/actions-runner; cd c:/actions-runner',
        `Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v${runnerVersion}/actions-runner-${config.input.ec2BaseOs}-${runnerVersion}.zip -OutFile actions-runner-win-x64-${runnerVersion}.zip`,
        `Expand-Archive -Path actions-runner-${config.input.ec2BaseOs}-${runnerVersion}.zip -DestinationPath $PWD`,
      );
    }
    
    userData.push(
      `./config.cmd --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --name ${config.input.ec2BaseOs}-${label} --labels ${label} --unattended --runasservice`,
      '</powershell>',
    );
  }
  else if (config.input.ec2BaseOs === 'linux-x64' || config.input.ec2BaseOs === 'linux-arm' || config.input.ec2BaseOs === 'linux-arm64'){
    userData.push(
      '#!/bin/bash',
    );

    if (config.input.runnerHomeDir) {
      userData.push(
        `cd "${config.input.runnerHomeDir}"`,
      );
    } else {
      userData.push(
        'mkdir actions-runner && cd actions-runner',
        `curl -O -L https://github.com/actions/runner/releases/download/v${runnerVersion}/actions-runner-${config.input.ec2BaseOs}-${runnerVersion}.tar.gz`,
        `tar xzf ./actions-runner-${config.input.ec2BaseOs}-${runnerVersion}.tar.gz`,
      );
    }

    userData.push(
      'export RUNNER_ALLOW_RUNASROOT=1',
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      `./config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --name ${config.input.ec2BaseOs}-${label} --token ${githubRegistrationToken} --labels ${label}`,
      './run.sh',
    );
  } else {
    core.error('Not supported ec2-base-os.');
  }
  
  return userData;
}

async function startEc2Instance(label, githubRegistrationToken) {
  const ec2 = new AWS.EC2();

  const userData = buildUserDataScript(githubRegistrationToken, label);

  const params = {  
    MinCount: 1,
    MaxCount: 1,
    UserData: Buffer.from(userData.join('\n')).toString('base64'),
  };
 
  if (config.input.ec2LaunchTemplate) {
    params.LaunchTemplate = {
      LaunchTemplateName: config.input.ec2LaunchTemplate
    };
  }
  
  if(config.input.ec2ImageId) {
    params.ImageId = config.input.ec2ImageId;
  }

  if(config.input.ec2InstanceType) {
    params.InstanceType = config.input.ec2InstanceType;
  }

  if(config.input.subnetId) {
    params.SubnetId = config.input.subnetId;
  }

  if(config.input.securityGroupId) {
    params.SecurityGroupIds = [config.input.securityGroupId];
  }

  if(config.input.iamRoleName) {
    params.IamInstanceProfile = { 
      Name: config.input.iamRoleName 
    };
  }

  if(config.tagSpecifications) {
    params.TagSpecifications = config.tagSpecifications;
  }

  core.info(params);

  try {
    const result = await ec2.runInstances(params).promise();
    const ec2InstanceId = result.Instances[0].InstanceId;
    core.info(`AWS EC2 instance ${ec2InstanceId} is started`);
    return ec2InstanceId;
  } catch (error) {
    core.error('AWS EC2 instance starting error');
    throw error;
  }
}

async function terminateEc2Instance() {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: [config.input.ec2InstanceId],
  };

  try {
    await ec2.terminateInstances(params).promise();
    core.info(`AWS EC2 instance ${config.input.ec2InstanceId} is terminated`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instance ${config.input.ec2InstanceId} termination error`);
    throw error;
  }
}

async function waitForInstanceRunning(ec2InstanceId) {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: [ec2InstanceId],
  };

  try {
    await ec2.waitFor('instanceRunning', params).promise();
    core.info(`AWS EC2 instance ${ec2InstanceId} is up and running`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instance ${ec2InstanceId} initialization error`);
    throw error;
  }
}

module.exports = {
  startEc2Instance,
  terminateEc2Instance,
  waitForInstanceRunning,
};
