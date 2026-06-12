const User = require('../model/user');

exports.getUserByEmail = async (email) => {
  try {
    return await User.findOne({ email: email });
  } catch (error) {
    console.error('Error fetching user details via email:', error);
    throw error;
  }
};

exports.getuserById = async (_id) => {
  try {
    return await User.findById(_id);
  } catch (error) {
    console.error('Error fetching user details via _id:', error);
    throw error;
  }
};

exports.createUser = async (name, email, passwordHash) => {
  try {
    return await User.create({
      name,
      email,
      password: {
        hash: passwordHash,   
        uuid: null,          
        isactive: false        
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

exports.createUuid = async (uuid, userId) => {
  try {
    // update the password field for the given user
    return await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'password.uuid': uuid,     
          'password.isactive': true      
        }
      },
      { returnDocument: 'after', runValidators: true } 
    );
  } catch (error) {
    console.error('Error creating UUID:', error);
    throw error;
  }
};

exports.getUuid = async (uuid) => {
  try {
    return await User.findOne({
      'password.uuid': uuid,   
      'password.isactive': true  
    });
  } catch (error) {
    console.error('Error fetching UUID:', error);
    throw error;
  }
};

exports.updateUuidStatus = async (uuid) => {
  try {
    return await User.updateOne(
      { 'password.uuid': uuid }, 
      { $set: { 'password.isactive': false } } 
    );
  } catch (error) {
    console.error('Error updating UUID:', error);
    throw error;
  }
};

exports.updateUserPassword = async (hash, userId) => {
  try {
    return await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'password.hash': hash,       
          'password.uuid': null,      
          'password.isactive': false    
        }
      },
      { returnDocument: 'after', runValidators: true } 
    );
  } catch (error) {
    console.error('Error updating user password:', error);
    throw error;
  }
};

exports.updateOrder = async (userId, orderId, status, session) => {
  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');

  user.order = { orderId, status };
  return await user.save({ session });
};

exports.getOrderDetails = async (userId, session) => {
  const user = await User.findById(userId).select('order').session(session);
  if (!user) throw new Error('User not found');
  return user.order;
};

exports.updateInterviewCount = async (_id) => {
  try {
    const user = await User.findById(_id);
    user.interviewCount++;
    await user.save();
    return user.interviewCount;
  } catch (error) {
    console.error('Error updating user interviewCount:', error);
    throw error;
  }
};