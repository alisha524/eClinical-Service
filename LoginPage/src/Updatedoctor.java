

import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * Servlet implementation class Updatedoctor
 */
public class Updatedoctor extends HttpServlet {
	private static final long serialVersionUID = 1L;
       
    /**
     * @see HttpServlet#HttpServlet()
     */
    public Updatedoctor() {
        super();
        // TODO Auto-generated constructor stub
    }

	/**
	 * @see HttpServlet#doGet(HttpServletRequest request, HttpServletResponse response)
	 */
	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		response.getWriter().append("Served at: ").append(request.getContextPath());
	}

	/**
	 * @see HttpServlet#doPost(HttpServletRequest request, HttpServletResponse response)
	 */
	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		try {
			String qualification = request.getParameter("qualification");
			String user = request.getParameter("username");
			Class.forName("com.mysql.jdbc.Driver"); // MySQL database connection
			Connection conn = DriverManager
					.getConnection("jdbc:mysql://127.0.0.1/rachel1", "rachel", "rachel");
			PreparedStatement pst = conn.prepareStatement("Select id,username from mastertable where username=? and usertype=?");
			pst.setString(1, user);
			pst.setString(2, "doctor");
			ResultSet rs = pst.executeQuery();
			if(rs.next()) {
				PreparedStatement pst1 = conn.prepareStatement("insert into doctors(doctor_id,qualification)"+"values(?, ?)");
				pst1.setInt(1, rs.getInt(1));
				pst1.setString(2,qualification);
				pst1.executeUpdate();
				pst1.close();
				conn.close();
			}
		}
		catch(Exception e) {
			e.printStackTrace();
		}
	}

}
