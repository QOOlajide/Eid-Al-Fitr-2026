import React, { useState, useEffect } from 'react';
import { MessageCircle, Clock, User, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Forum.css';

const Forum = () => {
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState({ title: '', content: '' });
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/forum/posts');
      const data = await response.json();
      if (data.success) {
        setPosts(data.data.posts);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  };

  const handleSubmitPost = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      alert('Please login to post questions');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/forum/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newPost)
      });

      const data = await response.json();
      if (data.success) {
        setPosts([data.data, ...posts]);
        setNewPost({ title: '', content: '' });
      }
    } catch (error) {
      console.error('Error creating post:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="forum-page">
      <div className="container">
        <div className="page-header">
          <h1>Community Forum</h1>
          <p>Ask questions and connect with the community</p>
        </div>

        <div className="forum-content">
          <div className="forum-ask">
            <h2>Ask a Question</h2>
            <form onSubmit={handleSubmitPost} className="ask-form">
              <div className="form-group">
                <label htmlFor="title">Question Title</label>
                <input
                  type="text"
                  id="title"
                  value={newPost.title}
                  onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                  placeholder="What would you like to know?"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="content">Your Question</label>
                <textarea
                  id="content"
                  value={newPost.content}
                  onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                  placeholder="Describe your question in detail..."
                  rows="4"
                  required
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading}
              >
                <Send size={16} />
                {loading ? 'Posting...' : 'Post Question'}
              </button>
            </form>
          </div>

          <div className="forum-posts">
            <h2>Recent Questions</h2>
            <div className="posts-list">
              {posts.length === 0 ? (
                <div className="no-posts">
                  <MessageCircle size={48} />
                  <p>No questions yet. Be the first to ask!</p>
                </div>
              ) : (
                posts.map((post) => (
                  <div key={post.id} className="post-item">
                    <div className="post-header">
                      <h3>{post.title}</h3>
                      <div className="post-meta">
                        <span className="author">
                          <User size={14} />
                          {post.author?.name || 'Anonymous'}
                        </span>
                        <span className="date">
                          <Clock size={14} />
                          {formatDate(post.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="post-content">{post.content}</p>
                    <div className="post-stats">
                      <span>{post.replies?.length || 0} replies</span>
                      <span>{post.views || 0} views</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Forum;
